const UPSTREAM = 'https://swan.tenfore.golf/api/';
const COURSES = new Set([16503, 16504, 16506, 16507, 16508, 16509, 16510, 16511, 16512]);
const SUBCOURSES = new Map([[16504, 1032], [16509, 1031]]);
const ZONE = 'America/New_York';
const MAX_ENTRIES = 128;
const AVAILABILITY = { fresh: 60_000, maxAge: 300_000 };
const METADATA = { fresh: 6 * 3600_000, maxAge: 24 * 3600_000 };
const WEATHER = { fresh: 30 * 60_000, maxAge: 6 * 3600_000 };
const DAY_CONCURRENCY = 4;
// Every bookable unit: each main course, plus the two approved subcourses.
const UNITS = [...COURSES].sort((a, b) => a - b).flatMap(id => [[id, 0], ...(SUBCOURSES.has(id) ? [[id, SUBCOURSES.get(id)]] : [])]);
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=39.154&longitude=-77.125&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=9';
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

function calendarDate(value) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function nextDate(value, days = 1) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

class SafeError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function schemaError() {
  return new SafeError(502, 'UPSTREAM_RESPONSE', 'TenFore returned an unexpected response. Please retry.');
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...extraHeaders
  } });
}

function parameters(url, allowed) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new SafeError(400, 'INVALID_INPUT', 'Use only the supported query parameters, once each.');
    }
  }
}

function integer(value) {
  if (!/^(0|[1-9]\d*)$/.test(value || '')) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function bookableDate(url, now) {
  const date = url.searchParams.get('date') || '';
  const today = calendarDate(now);
  if (!validDate(date) || date < today || date > nextDate(today, 7)) {
    throw new SafeError(400, 'INVALID_DATE', 'Choose a valid date from today through seven days ahead (Eastern time).');
  }
  return date;
}

function availabilityQuery(url, now) {
  parameters(url, ['courseId', 'subCourseId', 'date']);
  const courseId = integer(url.searchParams.get('courseId'));
  const subCourseId = url.searchParams.has('subCourseId') ? integer(url.searchParams.get('subCourseId')) : 0;
  if (!COURSES.has(courseId) || subCourseId === null || (subCourseId !== 0 && SUBCOURSES.get(courseId) !== subCourseId)) {
    throw new SafeError(400, 'INVALID_COURSE', 'Choose a supported MCG course and subcourse.');
  }
  return { courseId, subCourseId, date: bookableDate(url, now) };
}

function safeText(value, limit = 160) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : '';
}

function upstreamInteger(value, min, max) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max) throw schemaError();
  return number;
}

function sanitizeCourses(body) {
  if (!body || !Array.isArray(body.companyCourses) || body.successful === false || body.status?.successful === false) throw schemaError();
  const seen = new Set();
  const courses = body.companyCourses.filter(c => c && COURSES.has(Number(c.golfCourseID))).map(c => {
    const id = upstreamInteger(c.golfCourseID, 1, 99999);
    if (seen.has(id) || !safeText(c.courseName) || !/^[a-z0-9_-]{1,80}$/i.test(c.vanityName || '')) throw schemaError();
    seen.add(id);
    const images = (Array.isArray(c.images) ? c.images : []).slice(0, 20).flatMap(image => {
      if (!image || typeof image.imageURL !== 'string') return [];
      try {
        const url = new URL(image.imageURL);
        if (url.protocol !== 'https:' || url.username || url.password) return [];
        // Only the public display URL and image type leave the Worker.
        return [{ imageURL: url.href, imageTypeID: upstreamInteger(image.imageTypeID ?? image.imageTypeId ?? 0, 0, 1000) }];
      } catch { return []; }
    });
    const subCourses = (Array.isArray(c.subCourses) ? c.subCourses : []).filter(s => s && Number(s.subCourseID) === SUBCOURSES.get(id)).map(s => ({
      subCourseID: SUBCOURSES.get(id), name: safeText(s.name) || (id === 16504 ? 'Inside 9' : 'Executive 9')
    }));
    return {
      golfCourseID: id, courseName: safeText(c.courseName), vanityName: c.vanityName,
      maxBookingPlayers: upstreamInteger(c.maxBookingPlayers ?? 4, 1, 16),
      minBookingPlayers: upstreamInteger(c.minBookingPlayers ?? 1, 1, 16),
      defaultNumberOfHoles: upstreamInteger(c.defaultNumberOfHoles ?? 18, 1, 36),
      maxBookingDaysOut: upstreamInteger(c.maxBookingDaysOut ?? 7, 0, 365), images, subCourses
    };
  });
  if (!courses.length) throw schemaError();
  return { companyCourses: courses };
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string') throw schemaError();
  let normalized = value.replace(/([+-])(\d{1,2})$/, (_, sign, hour) => `${sign}${hour.padStart(2, '0')}:00`);
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match || !validDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) throw schemaError();
  if (!match[5]) {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'shortOffset' }).formatToParts(new Date(`${match[1]}T12:00:00Z`)).find(p => p.type === 'timeZoneName').value;
    normalized += offset.replace(/^GMT([+-])(\d+)$/, (_, sign, hour) => `${sign}${hour.padStart(2, '0')}:00`);
  }
  if (!Number.isFinite(Date.parse(normalized))) throw schemaError();
  return normalized;
}

function positivePrice(row) {
  for (const value of [row.listingPrice, row.teeFeePrice]) {
    if (value === null || value === undefined || value === '') continue;
    const price = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

function sanitizeTimes(body, date) {
  if (!body || body.status?.successful !== true || body.successful === false || !Array.isArray(body.teeTimes)) throw schemaError();
  const teeTimes = body.teeTimes.map(row => {
    if (!row || !((typeof row.teeTimeID === 'number' && Number.isSafeInteger(row.teeTimeID) && row.teeTimeID > 0) || (typeof row.teeTimeID === 'string' && /^[a-z0-9_-]{1,100}$/i.test(row.teeTimeID)))) throw schemaError();
    const dateScheduled = normalizeTimestamp(row.dateScheduled);
    const maxSlots = upstreamInteger(row.maxSlots, 1, 16);
    const availableSlots = upstreamInteger(row.availableSlots, 0, maxSlots);
    return { teeTimeID: row.teeTimeID, dateScheduled, availableSlots, maxSlots, maxPlayers: maxSlots, priceBeforeTax: positivePrice(row) };
  }).filter(row => calendarDate(row.dateScheduled) === date);
  return { teeTimes, status: { successful: true } };
}

function rounded(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function sanitizeWeather(body) {
  const daily = body?.daily, hourly = body?.hourly;
  if (!daily || !hourly || !Array.isArray(daily.time) || !Array.isArray(hourly.time)) throw schemaError();
  const column = (source, key) => Array.isArray(source[key]) && source[key].length === source.time.length ? source[key] : Array(source.time.length).fill(null);
  const clock = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value.slice(11, 16) : null;
  const days = {}, hours = {};
  daily.time.slice(0, 16).forEach((date, i) => {
    if (!validDate(date)) throw schemaError();
    days[date] = {
      sunrise: clock(column(daily, 'sunrise')[i]), sunset: clock(column(daily, 'sunset')[i]),
      high: rounded(column(daily, 'temperature_2m_max')[i]), low: rounded(column(daily, 'temperature_2m_min')[i]),
      rainMax: rounded(column(daily, 'precipitation_probability_max')[i]), windMax: rounded(column(daily, 'wind_speed_10m_max')[i])
    };
  });
  hourly.time.slice(0, 16 * 24).forEach((time, i) => {
    const match = typeof time === 'string' && time.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):00$/);
    if (!match || !validDate(match[1]) || Number(match[2]) > 23) throw schemaError();
    (hours[match[1]] ||= []).push({
      hour: Number(match[2]), temp: rounded(column(hourly, 'temperature_2m')[i]), rain: rounded(column(hourly, 'precipitation_probability')[i]),
      wind: rounded(column(hourly, 'wind_speed_10m')[i]), code: rounded(column(hourly, 'weather_code')[i])
    });
  });
  if (!Object.keys(days).length) throw schemaError();
  return { days, hours };
}

async function settleAll(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { status: 'fulfilled', value: await task(items[index]) }; } catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}

export function createWorker(dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch.bind(globalThis);
  const now = dependencies.now || Date.now;
  const storage = dependencies.cacheStorage === undefined ? globalThis.caches : dependencies.cacheStorage;
  const cache = storage?.default || (storage?.match && storage?.put ? storage : null);
  const memory = new Map();
  const inFlight = new Map();
  const timeoutMs = dependencies.timeoutMs ?? 10_000;

  function remember(key, entry) {
    memory.delete(key);
    memory.set(key, entry);
    while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value);
  }

  function upstream(path, params) {
    const url = new URL(path, UPSTREAM);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return getJson(url.toString(), 'TenFore');
  }

  async function getJson(url, service) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          // Workers has no browser cookie jar. Reject redirects through the status check below.
          const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal, redirect: 'manual' });
          if (!response.ok) throw new SafeError(response.status === 429 ? 503 : 502, 'UPSTREAM_UNAVAILABLE', `${service} is temporarily unavailable. Please retry shortly.`);
          return await response.json();
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => {
          reject(new SafeError(503, 'UPSTREAM_TIMEOUT', `${service} took too long to respond. Please retry.`));
          controller.abort();
        }, timeoutMs); })
      ]);
    } catch (error) {
      if (error instanceof SafeError) throw error;
      throw new SafeError(502, 'UPSTREAM_UNAVAILABLE', `Couldn’t check ${service}. Please retry shortly.`);
    } finally { clearTimeout(timer); }
  }

  async function cached(key, policy, loader) {
    if (inFlight.has(key)) return inFlight.get(key);
    if (inFlight.size >= MAX_ENTRIES) throw new SafeError(503, 'BUSY', 'Please wait a moment and retry.');
    const pending = (async () => {
      const cacheRequest = new Request(`https://mcg-golf-time.internal/cache/v2/${key}`);
      let entry = memory.get(key);
      if (!entry && cache) {
        try {
          const response = await cache.match(cacheRequest);
          if (response) {
            const stored = await response.json();
            if (Number.isFinite(stored.fetchedAt) && stored.data) { entry = stored; remember(key, entry); }
          }
        } catch { /* Shared cache outages must not prevent the upstream read. */ }
      }
      const age = entry ? Number(now()) - entry.fetchedAt : Infinity;
      if (age >= 0 && age < policy.fresh) return { ...entry.data, meta: { fetchedAt: new Date(entry.fetchedAt).toISOString(), stale: false } };
      try {
        const data = await loader();
        const fresh = { data, fetchedAt: Number(now()) };
        remember(key, fresh);
        if (cache) {
          try { await cache.put(cacheRequest, new Response(JSON.stringify(fresh), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.ceil(policy.maxAge / 1000)}` } })); } catch { /* Memory remains usable. */ }
        }
        return { ...data, meta: { fetchedAt: new Date(fresh.fetchedAt).toISOString(), stale: false } };
      } catch (error) {
        // Recheck age after the failed request, including time spent waiting.
        const staleAge = entry ? Number(now()) - entry.fetchedAt : Infinity;
        if (staleAge >= 0 && staleAge <= policy.maxAge) return { ...entry.data, meta: { fetchedAt: new Date(entry.fetchedAt).toISOString(), stale: true } };
        memory.delete(key);
        throw error;
      }
    })();
    inFlight.set(key, pending);
    try { return await pending; } finally { inFlight.delete(key); }
  }

  function availability(courseId, subCourseId, date) {
    // TenFore's legacy endpoint returns no rows for subCourseID=0, so main courses omit it.
    const params = { golfCourseID: courseId, ...(subCourseId ? { subCourseID: subCourseId } : {}), startDate: date, endDate: nextDate(date) };
    return cached(`availability/${courseId}/${subCourseId}/${date}`, AVAILABILITY, async () => sanitizeTimes(await upstream('BookingEngine/Get', params), date));
  }

  return { async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    if (request.method !== 'GET') return json({ successful: false, code: 'METHOD_NOT_ALLOWED', messageForUser: 'Use GET for this read-only API.' }, 405, { Allow: 'GET' });
    try {
      if (url.pathname === '/api/health') { parameters(url, []); return json({ ok: true }); }
      if (url.pathname === '/api/courses') {
        parameters(url, []);
        return json(await cached('courses', METADATA, async () => sanitizeCourses(await upstream('GolfCourse/GetGolfCourseByVanity', { vanityName: 'mcggolf' }))));
      }
      if (url.pathname === '/api/availability') {
        const query = availabilityQuery(url, now());
        return json(await availability(query.courseId, query.subCourseId, query.date));
      }
      if (url.pathname === '/api/day') {
        parameters(url, ['date']);
        const date = bookableDate(url, now());
        const settled = await settleAll(UNITS, DAY_CONCURRENCY, ([courseId, subCourseId]) => availability(courseId, subCourseId, date));
        const units = settled.map((result, i) => {
          const [courseId, subCourseId] = UNITS[i];
          if (result.status === 'fulfilled') return { courseId, subCourseId, ok: true, teeTimes: result.value.teeTimes, meta: result.value.meta };
          const safe = result.reason instanceof SafeError ? result.reason : new SafeError(502, 'UNAVAILABLE', 'Availability is temporarily unavailable. Please retry.');
          return { courseId, subCourseId, ok: false, code: safe.code, messageForUser: safe.message };
        });
        return json({ date, units, meta: { fetchedAt: new Date(Number(now())).toISOString() } });
      }
      if (url.pathname === '/api/weather') {
        parameters(url, []);
        return json(await cached('weather', WEATHER, async () => sanitizeWeather(await getJson(WEATHER_URL, 'Weather'))));
      }
      return json({ successful: false, code: 'NOT_FOUND', messageForUser: 'API route not found.' }, 404);
    } catch (error) {
      const safe = error instanceof SafeError ? error : new SafeError(502, 'UNAVAILABLE', 'Availability is temporarily unavailable. Please retry.');
      return json({ successful: false, code: safe.code, messageForUser: safe.message }, safe.status);
    }
  } };
}

export default createWorker();
