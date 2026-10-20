const UPSTREAM = 'https://swan.tenfore.golf/api/';
const COURSES = new Set([16503, 16504, 16506, 16507, 16508, 16509, 16510, 16511, 16512]);
const SUBCOURSES = new Map([[16504, 1032], [16509, 1031]]);
const ZONE = 'America/New_York';
const MAX_MEMORY = 256;
const UPSTREAM_CONCURRENCY = 4;
const FAILURE_BACKOFF = 30_000;
const EDGE_TTL = 30;
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
// fresh: served as-is. Until maxStale: served immediately while one background refresh runs.
const NEAR_AVAILABILITY = { fresh: 2 * MINUTE, maxStale: 30 * MINUTE };
const FAR_AVAILABILITY = { fresh: 10 * MINUTE, maxStale: 30 * MINUTE };
const METADATA = { fresh: DAY, maxStale: 7 * DAY };
const WEATHER = { fresh: 30 * MINUTE, maxStale: 6 * HOUR };
// Rate-card scope and display facts that TenFore's fee feed does not encode.
const NINE_HOLE_COURSES = new Set([16512]);
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

function schemaError() {
  return new SafeError(502, 'UPSTREAM_RESPONSE', 'TenFore returned an unexpected response. Please retry.');
}

export class SafeError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
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


// ---- Public rate card (TeeFees) ----
function clockMinutes(value) {
  const match = typeof value === 'string' && value.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return null;
  return (Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
}

function feeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!validDate(date)) throw schemaError();
  return date;
}

function feePrice(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Only `everyone:true` rows are public rates; member, senior and junior rows never leave the Worker. */
export function sanitizeFees(body) {
  if (!body || !Array.isArray(body.teeFees) || body.successful === false || body.status?.successful === false) throw schemaError();
  const fees = body.teeFees.filter(row => row && row.everyone === true).flatMap(row => {
    const start = clockMinutes(row.startTime), end = clockMinutes(row.endTime);
    const days = [...new Set((Array.isArray(row.days) ? row.days : []).map(d => d?.index).filter(i => Number.isInteger(i) && i >= 0 && i <= 6))].sort();
    if (start === null || end === null || !days.length) return [];
    return [{ title: safeText(row.title, 80), start, end, days, startDate: feeDate(row.startDate), endDate: feeDate(row.endDate), price9: feePrice(row.price9), price18: feePrice(row.price18) }];
  });
  return { fees };
}

function unitHoles(unit) {
  return unit.subCourseId || NINE_HOLE_COURSES.has(unit.courseId) ? 9 : 18;
}

function feeAppliesTo(fee, unit) {
  if (/inside\s*9/i.test(fee.title)) return unit.courseId === 16504 && unit.subCourseId === 1032;
  if (/exec/i.test(fee.title)) return unit.courseId === 16509 && unit.subCourseId === 1031;
  return !unit.subCourseId;
}

/**
 * The public walking rate for one tee time from a course's sanitized fee rows, or null.
 * `unit` is {courseId, subCourseId, holes?}; the tee time's own wall clock is Eastern.
 */
export function publicRate(fees, unit, teeTimeISO) {
  const match = typeof teeTimeISO === 'string' && teeTimeISO.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match || !Array.isArray(fees)) return null;
  const date = match[1], minute = Number(match[2]) * 60 + Number(match[3]);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const holes = unit.holes || unitHoles(unit);
  let best = null;
  for (const fee of fees) {
    if (!feeAppliesTo(fee, unit) || !fee.days.includes(weekday) || minute < fee.start || minute > fee.end) continue;
    if ((fee.startDate && date < fee.startDate) || (fee.endDate && date > fee.endDate)) continue;
    const price = holes === 9 ? fee.price9 : fee.price18;
    if (!(price > 0 && price <= 300)) continue;
    if (!best || fee.end - fee.start < best.end - best.start) best = { ...fee, price };
  }
  return best ? best.price : null;
}

function withRates(teeTimes, fees, unit) {
  return teeTimes.map(row => {
    if (row.priceBeforeTax > 0) return { ...row, rate: row.priceBeforeTax, rateSource: 'teetime' };
    const rate = fees ? publicRate(fees, unit, row.dateScheduled) : null;
    return { ...row, rate, rateSource: rate === null ? null : 'ratecard' };
  });
}

/** Availability freshness by Eastern day offset: today and tomorrow move fastest. */
export function availabilityPolicy(date, now) {
  const today = calendarDate(now);
  return date <= nextDate(today, 1) ? NEAR_AVAILABILITY : FAR_AVAILABILITY;
}

// ---- Global upstream cache (runs inside the single Durable Object) ----
export function memoryStorage(map = new Map()) {
  return {
    map,
    async get(key) { return map.get(key); },
    async put(key, value) { map.set(key, structuredClone(value)); },
    async delete(keys) { for (const key of [].concat(keys)) map.delete(key); },
    async list({ prefix = '' } = {}) { return new Map([...map].filter(([key]) => key.startsWith(prefix))); }
  };
}

/**
 * Stale-while-revalidate cache with persistent storage, request coalescing, a failure backoff
 * and a cap on concurrent upstream fetches. `storage` is DO `ctx.storage` or `memoryStorage()`.
 */
export function createUpstreamCache({ now = Date.now, storage = memoryStorage(), concurrency = UPSTREAM_CONCURRENCY, backoffMs = FAILURE_BACKOFF } = {}) {
  const memory = new Map();
  const inFlight = new Map();
  const failures = new Map();
  const background = new Set();
  const waiting = [];
  let active = 0;

  function remember(key, entry) {
    memory.delete(key);
    memory.set(key, entry);
    while (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value);
  }

  async function limited(task) {
    if (active >= concurrency) await new Promise(resolve => waiting.push(resolve));
    active++;
    try { return await task(); } finally { active--; waiting.shift()?.(); }
  }

  async function read(key) {
    if (memory.has(key)) return memory.get(key);
    try {
      const stored = await storage.get(key);
      if (stored && Number.isFinite(stored.fetchedAt) && stored.value !== undefined) { remember(key, stored); return stored; }
    } catch { /* Storage trouble must not block an upstream read. */ }
    return null;
  }

  function refresh(key, loader) {
    if (inFlight.has(key)) return inFlight.get(key);
    const failure = failures.get(key);
    if (failure && Number(now()) < failure.until) return Promise.reject(failure.error);
    const pending = limited(loader).then(async value => {
      const entry = { value, fetchedAt: Number(now()) };
      remember(key, entry);
      failures.delete(key);
      try { await storage.put(key, entry); } catch { /* Memory still serves this isolate. */ }
      return entry;
    }, error => {
      failures.set(key, { until: Number(now()) + backoffMs, error });
      throw error;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  function result(entry, policy) {
    const age = Number(now()) - entry.fetchedAt;
    return { value: entry.value, meta: { fetchedAt: new Date(entry.fetchedAt).toISOString(), stale: age >= policy.fresh } };
  }

  async function get(key, policy, loader) {
    const entry = await read(key);
    const age = entry ? Number(now()) - entry.fetchedAt : Infinity;
    if (age >= 0 && age < policy.fresh) return result(entry, policy);
    if (age >= 0 && age <= policy.maxStale) {
      const failure = failures.get(key);
      if (!inFlight.has(key) && !(failure && Number(now()) < failure.until)) {
        const task = refresh(key, loader).catch(() => {}).finally(() => background.delete(task));
        background.add(task);
      }
      return result(entry, policy);
    }
    return result(await refresh(key, loader), policy);
  }

  return { get, idle: () => Promise.all([...background]), stats: () => ({ memory: memory.size, inFlight: inFlight.size, active, queued: waiting.length }) };
}

/** Everything that talks to TenFore or Open-Meteo. Lives in the Durable Object in production. */
export function createUpstreamService(dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch.bind(globalThis);
  const now = dependencies.now || Date.now;
  const timeoutMs = dependencies.timeoutMs ?? 10_000;
  const log = dependencies.log || (() => {});
  const storage = dependencies.storage || memoryStorage();
  const cache = createUpstreamCache({ now, storage, concurrency: dependencies.concurrency, backoffMs: dependencies.backoffMs });
  let prunedOn = '';

  async function getJson(key, url, service) {
    log(key);
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

  function tenfore(key, path, params) {
    const url = new URL(path, UPSTREAM);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return getJson(key, url.toString(), 'TenFore');
  }

  async function prune() {
    // Past days are never requested again; drop them once per Eastern day.
    const today = calendarDate(now());
    if (prunedOn === today || typeof storage.list !== 'function') return;
    prunedOn = today;
    try {
      const old = [...(await storage.list({ prefix: 'availability/' })).keys()].filter(key => key.slice(-10) < today);
      for (let i = 0; i < old.length; i += 128) await storage.delete(old.slice(i, i + 128));
    } catch { /* Best effort. */ }
  }

  const courses = () => cache.get('courses', METADATA, async () => sanitizeCourses(await tenfore('courses', 'GolfCourse/GetGolfCourseByVanity', { vanityName: 'mcggolf' })));
  const fees = courseId => cache.get(`fees/${courseId}`, METADATA, async () => sanitizeFees(await tenfore(`fees/${courseId}`, 'TeeFees', { golfCourseID: courseId })));
  const weather = () => cache.get('weather', WEATHER, async () => sanitizeWeather(await getJson('weather', WEATHER_URL, 'Weather')));

  async function availability(courseId, subCourseId, date) {
    prune();
    const key = `availability/${courseId}/${subCourseId}/${date}`;
    // TenFore's legacy endpoint returns no rows for subCourseID=0, so main courses omit it.
    const params = { golfCourseID: courseId, ...(subCourseId ? { subCourseID: subCourseId } : {}), startDate: date, endDate: nextDate(date) };
    const [times, rateCard] = await Promise.all([
      cache.get(key, availabilityPolicy(date, now()), async () => sanitizeTimes(await tenfore(key, 'BookingEngine/Get', params), date)),
      fees(courseId).catch(() => null)
    ]);
    return { teeTimes: withRates(times.value.teeTimes, rateCard?.value.fees, { courseId, subCourseId }), meta: times.meta };
  }

  async function day(date) {
    const units = await Promise.all(UNITS.map(async ([courseId, subCourseId]) => {
      try {
        const { teeTimes, meta } = await availability(courseId, subCourseId, date);
        return { courseId, subCourseId, ok: true, teeTimes, meta };
      } catch (error) {
        const safe = error instanceof SafeError ? error : new SafeError(502, 'UNAVAILABLE', 'Availability is temporarily unavailable. Please retry.');
        return { courseId, subCourseId, ok: false, code: safe.code, messageForUser: safe.message };
      }
    }));
    return { date, units, meta: { fetchedAt: new Date(Number(now())).toISOString() } };
  }

  // Internal protocol between the Worker and the Durable Object. Inputs are validated by the Worker.
  async function fetch(request) {
    const url = new URL(request.url);
    const q = url.searchParams;
    try {
      if (url.pathname === '/courses') { const r = await courses(); return json({ ...r.value, meta: r.meta }); }
      if (url.pathname === '/weather') { const r = await weather(); return json({ ...r.value, meta: r.meta }); }
      if (url.pathname === '/availability') {
        const r = await availability(Number(q.get('courseId')), Number(q.get('subCourseId')), q.get('date'));
        return json({ teeTimes: r.teeTimes, status: { successful: true }, meta: r.meta });
      }
      if (url.pathname === '/day') return json(await day(q.get('date')));
      return json({ successful: false, code: 'NOT_FOUND', messageForUser: 'API route not found.' }, 404);
    } catch (error) {
      const safe = error instanceof SafeError ? error : new SafeError(502, 'UNAVAILABLE', 'Availability is temporarily unavailable. Please retry.');
      return json({ successful: false, code: safe.code, messageForUser: safe.message }, safe.status);
    }
  }

  return { fetch, idle: cache.idle, stats: cache.stats };
}

// ---- Edge Worker: validates input, then makes one Durable Object request per API call ----
export function createWorker(dependencies = {}) {
  const now = dependencies.now || Date.now;
  const storage = dependencies.cacheStorage === undefined ? globalThis.caches : dependencies.cacheStorage;
  const edge = storage?.default || (storage?.match && storage?.put ? storage : null);

  function upstream(env) {
    if (dependencies.upstream) return dependencies.upstream;
    if (!env.UPSTREAM) throw new SafeError(503, 'UNAVAILABLE', 'Availability is temporarily unavailable. Please retry.');
    return env.UPSTREAM.get(env.UPSTREAM.idFromName('global'));
  }

  async function relay(env, ctx, path, { edgeCache = false } = {}) {
    const edgeKey = new Request(`https://mcg-golf-time.internal/edge/v1${path}`);
    if (edgeCache && edge) {
      try {
        const hit = await edge.match(edgeKey);
        if (hit) return json(await hit.json());
      } catch { /* Fall through to the Durable Object. */ }
    }
    const response = await upstream(env).fetch(new Request(`https://upstream.internal${path}`));
    let body;
    try { body = await response.json(); } catch { throw new SafeError(502, 'UNAVAILABLE', 'Availability is temporarily unavailable. Please retry.'); }
    if (response.ok && edgeCache && edge) {
      const put = edge.put(edgeKey, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${EDGE_TTL}` } })).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
    }
    return json(body, response.status);
  }

  return { async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }
    if (request.method !== 'GET') return json({ successful: false, code: 'METHOD_NOT_ALLOWED', messageForUser: 'Use GET for this read-only API.' }, 405, { Allow: 'GET' });
    try {
      if (url.pathname === '/api/health') { parameters(url, []); return json({ ok: true }); }
      if (url.pathname === '/api/courses') { parameters(url, []); return await relay(env, ctx, '/courses', { edgeCache: true }); }
      if (url.pathname === '/api/weather') { parameters(url, []); return await relay(env, ctx, '/weather', { edgeCache: true }); }
      if (url.pathname === '/api/availability') {
        const q = availabilityQuery(url, now());
        return await relay(env, ctx, `/availability?courseId=${q.courseId}&subCourseId=${q.subCourseId}&date=${q.date}`);
      }
      if (url.pathname === '/api/day') {
        parameters(url, ['date']);
        return await relay(env, ctx, `/day?date=${bookableDate(url, now())}`, { edgeCache: true });
      }
      return json({ successful: false, code: 'NOT_FOUND', messageForUser: 'API route not found.' }, 404);
    } catch (error) {
      const safe = error instanceof SafeError ? error : new SafeError(502, 'UNAVAILABLE', 'Availability is temporarily unavailable. Please retry.');
      return json({ successful: false, code: safe.code, messageForUser: safe.message }, safe.status);
    }
  } };
}
