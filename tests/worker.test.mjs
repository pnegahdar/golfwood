import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';

const START = Date.parse('2026-10-20T14:00:00Z');
const row = (extra = {}) => ({ teeTimeID: 123, dateScheduled: '2026-10-20T08:00:00.000-4', availableSlots: 2, maxSlots: 4, listingPrice: 29, ...extra });
const times = (rows = [row()]) => ({ teeTimes: rows, status: { successful: true }, notes: 'internal', customerName: 'private' });
const response = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const request = (query = 'courseId=16504&subCourseId=1032&date=2026-10-20', options) => new Request(`https://example.test/api/availability?${query}`, options);
const course = (extra = {}) => ({ golfCourseID: 16504, courseName: 'Northwest Golf Course', vanityName: 'northwest', maxBookingPlayers: 4, minBookingPlayers: 1, defaultNumberOfHoles: 18, maxBookingDaysOut: 7, images: [{ imageTypeID: 15, imageURL: 'https://firebasestorage.googleapis.com/public.png', secret: 'secret' }], subCourses: [{ subCourseID: 1032, name: 'Inside 9', processorKey: 'secret' }, { subCourseID: 777, name: 'Other' }], paymentProcessorKey: 'secret', ...extra });
function harness(fetchImpl = async () => response(times()), options = {}) {
  let clock = START;
  const calls = [];
  const worker = createWorker({ now: () => clock, cacheStorage: null, fetchImpl: async (...args) => { calls.push(args); return fetchImpl(...args); }, ...options });
  return { worker, calls, advance(ms) { clock += ms; }, fetch: (req = request(), env) => worker.fetch(req, env) };
}

test('validates exact integers, known courses, subcourse pairs, dates, duplicates and query allowlist before fetching', async () => {
  const h = harness();
  const invalid = [
    'courseId=16504x&date=2026-10-20', 'courseId=016504&date=2026-10-20', 'courseId=9&date=2026-10-20',
    'courseId=16503&subCourseId=1032&date=2026-10-20', 'courseId=16509&subCourseId=1032&date=2026-10-20',
    'courseId=16504&subCourseId=1.5&date=2026-10-20', 'courseId=16504&subCourseId=&date=2026-10-20',
    'courseId=16504&date=2026-10-19', 'courseId=16504&date=2026-10-28', 'courseId=16504&date=2026-02-30',
    'courseId=16504&date=2026-10-32', 'courseId=16504&date=2026-10-20&date=2026-10-21',
    'courseId=16504&date=2026-10-20&url=https://example.org', 'courseId=16504&date=2026-10-20&_=123',
    'courseId=16504&date=2026-10-20&courseId=16509', 'date=2026-10-20'
  ];
  for (const query of invalid) assert.equal((await h.fetch(request(query))).status, 400, query);
  assert.equal(h.calls.length, 0);
});

test('NY calendar controls today and the inclusive seven-day boundary, including DST', async () => {
  const h = harness(async () => response(times([])), { now: () => Date.parse('2026-11-02T02:00:00Z') });
  for (const date of ['2026-11-01', '2026-11-08']) assert.equal((await h.fetch(request(`courseId=16509&subCourseId=1031&date=${date}`))).status, 200);
  assert.equal((await h.fetch(request('courseId=16509&date=2026-11-09'))).status, 400);
});

test('uses only the legacy GET with next-day end and preserves remaining capacity, price and safe fields', async () => {
  const h = harness(async (url, options) => {
    const upstream = new URL(url);
    assert.equal(upstream.origin, 'https://swan.tenfore.golf');
    assert.equal(upstream.pathname, '/api/BookingEngine/Get');
    assert.deepEqual(Object.fromEntries(upstream.searchParams), { golfCourseID: '16504', subCourseID: '1032', startDate: '2026-10-20', endDate: '2026-10-21' });
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.equal(options.credentials, undefined);
    return response(times([row({ customers: ['secret'], bookedPlayers: 2 }), row({ teeTimeID: 124, listingPrice: 0, teeFeePrice: 0 }), row({ teeTimeID: 125, listingPrice: null, teeFeePrice: '35.50' }), row({ teeTimeID: 126, dateScheduled: '2026-10-21T08:00:00.000-4' })]));
  });
  const res = await h.fetch();
  const body = await res.json();
  assert.deepEqual(body.teeTimes[0], { teeTimeID: 123, dateScheduled: '2026-10-20T08:00:00.000-04:00', availableSlots: 2, maxSlots: 4, maxPlayers: 4, priceBeforeTax: 29 });
  assert.equal(body.teeTimes.length, 3);
  assert.equal(body.teeTimes[1].priceBeforeTax, null);
  assert.equal(body.teeTimes[2].priceBeforeTax, 35.5);
  assert.equal(body.meta.stale, false);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.doesNotMatch(JSON.stringify(body), /secret|customer|notes/);
});

test('main courses omit the subcourse (TenFore returns nothing for zero) and month rollover sends the next day', async () => {
  const h = harness(async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.has('subCourseID'), false);
    assert.equal(params.get('endDate'), '2026-11-01');
    return response(times([]));
  }, { now: () => Date.parse('2026-10-31T12:00:00Z') });
  assert.equal((await h.fetch(request('courseId=16512&date=2026-10-31'))).status, 200);
});

test('metadata is explicitly sanitized and restricted to approved MCG courses and subcourses', async () => {
  const h = harness(async url => {
    assert.match(url, /GolfCourse\/GetGolfCourseByVanity\?vanityName=mcggolf$/);
    return response({ processorToken: 'secret', companyCourses: [course(), course({ golfCourseID: 999, vanityName: 'other' })] });
  });
  const body = await (await h.fetch(new Request('https://example.test/api/courses'))).json();
  assert.equal(body.companyCourses.length, 1);
  assert.deepEqual(Object.keys(body.companyCourses[0]).sort(), ['golfCourseID', 'courseName', 'vanityName', 'maxBookingPlayers', 'minBookingPlayers', 'defaultNumberOfHoles', 'maxBookingDaysOut', 'images', 'subCourses'].sort());
  assert.deepEqual(body.companyCourses[0].subCourses, [{ subCourseID: 1032, name: 'Inside 9' }]);
  assert.deepEqual(body.companyCourses[0].images, [{ imageURL: 'https://firebasestorage.googleapis.com/public.png', imageTypeID: 15 }]);
  assert.doesNotMatch(JSON.stringify(body), /secret|processor/i);
});

test('successful empty results are cacheable while bad envelopes, verification, malformed schemas and HTTP failures are errors', async () => {
  const empty = harness(async () => response(times([])));
  assert.deepEqual((await (await empty.fetch()).json()).teeTimes, []);
  await empty.fetch();
  assert.equal(empty.calls.length, 1);
  for (const body of [{}, { teeTimes: [] }, { teeTimes: [], status: { successful: false, messageForUser: 'private verification' } }, times([row({ maxSlots: 0 })]), times([row({ availableSlots: 5 })]), times([row({ dateScheduled: '2026-02-30T08:00:00-04:00' })]), '<html>private captcha</html>', times([row({ teeTimeID: null })])]) {
    const h = harness(async () => response(body));
    for (let n = 0; n < 2; n++) {
      const res = await h.fetch();
      assert.equal(res.status, 502);
      const data = await res.json();
      assert.equal(data.successful, false);
      assert.doesNotMatch(JSON.stringify(data), /private|captcha|html/);
    }
    assert.equal(h.calls.length, 2, 'failures are never cached');
  }
  for (const status of [403, 429, 500]) {
    const h = harness(async () => response('private', status));
    assert.equal((await h.fetch()).status, status === 429 ? 503 : 502);
  }
});

test('fresh entries are reused for 60 seconds and expired entries are refreshed', async () => {
  const h = harness();
  const first = await (await h.fetch()).json();
  h.advance(59_999);
  assert.deepEqual(await (await h.fetch()).json(), first);
  assert.equal(h.calls.length, 1);
  h.advance(1);
  const second = await (await h.fetch()).json();
  assert.equal(h.calls.length, 2);
  assert.notEqual(first.meta.fetchedAt, second.meta.fetchedAt);
  assert.equal(second.meta.stale, false);
});

test('stale availability is served only after upstream errors and never beyond five minutes from fetch', async () => {
  let fail = false;
  const h = harness(async () => { if (fail) throw new Error('private token'); return response(times()); });
  const first = await (await h.fetch()).json();
  h.advance(60_000);
  fail = true;
  const stale = await (await h.fetch()).json();
  assert.equal(stale.meta.stale, true);
  assert.equal(stale.meta.fetchedAt, first.meta.fetchedAt);
  h.advance(240_000);
  assert.equal((await (await h.fetch()).json()).meta.stale, true);
  h.advance(1);
  assert.equal((await h.fetch()).status, 502);
  fail = false;
  assert.equal((await (await h.fetch()).json()).meta.stale, false);
});

test('stale max age is rechecked after a slow failing upstream request', async () => {
  let fail = false;
  const h = harness(async () => {
    if (fail) { h.advance(10_000); throw new Error('down'); }
    return response(times());
  });
  await h.fetch();
  h.advance(299_000);
  fail = true;
  assert.equal((await h.fetch()).status, 502);
});

test('metadata caches for six hours and stale metadata is bounded to 24 hours', async () => {
  let fail = false;
  const h = harness(async () => { if (fail) throw new Error('down'); return response({ companyCourses: [course()] }); });
  const req = new Request('https://example.test/api/courses');
  await h.fetch(req);
  h.advance(6 * 3600_000 - 1);
  await h.fetch(req);
  assert.equal(h.calls.length, 1);
  h.advance(1);
  fail = true;
  assert.equal((await (await h.fetch(req)).json()).meta.stale, true);
  h.advance(18 * 3600_000 + 1);
  assert.equal((await h.fetch(req)).status, 502);
});

test('concurrent identical requests coalesce and distinct dates remain separate', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const h = harness(async () => { await waiting; return response(times()); });
  const pending = Array.from({ length: 10 }, () => h.fetch());
  await Promise.resolve();
  assert.equal(h.calls.length, 1);
  release();
  assert.ok((await Promise.all(pending)).every(r => r.status === 200));
  await h.fetch(request('courseId=16504&subCourseId=1032&date=2026-10-21'));
  assert.equal(h.calls.length, 2);
});

test('Cloudflare cache survives a new isolate and still enforces fresh and stale ages', async () => {
  const stored = new Map();
  const cache = { async match(req) { return stored.get(req.url)?.clone(); }, async put(req, res) { stored.set(req.url, res.clone()); } };
  const h = harness(undefined, { cacheStorage: { default: cache } });
  await h.fetch();
  assert.equal(stored.size, 1);
  const h2 = harness(async () => { throw new Error('upstream unavailable'); }, { cacheStorage: { default: cache } });
  assert.equal((await (await h2.fetch()).json()).meta.stale, false);
  assert.equal(h2.calls.length, 0);
  h2.advance(60_000);
  assert.equal((await (await h2.fetch()).json()).meta.stale, true);
  h2.advance(300_000);
  assert.equal((await h2.fetch()).status, 502);
});

test('cache outages use bounded memory and upstream timeout terminates even a fetch ignoring abort', async () => {
  const h = harness(undefined, { cacheStorage: { async match() { throw new Error('cache down'); }, async put() { throw new Error('cache down'); } } });
  assert.equal((await h.fetch()).status, 200);
  await h.fetch();
  assert.equal(h.calls.length, 1);
  let signal;
  const stalled = harness((url, options) => { signal = options.signal; return new Promise(() => {}); }, { timeoutMs: 5 });
  const result = await stalled.fetch();
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, 'UPSTREAM_TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('routes have read-only methods, safe health and static asset passthrough', async () => {
  const h = harness();
  assert.deepEqual(await (await h.fetch(new Request('https://example.test/api/health'))).json(), { ok: true });
  const post = await h.fetch(request(undefined, { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  assert.equal((await h.fetch(new Request('https://example.test/api/anything'))).status, 404);
  assert.equal((await h.fetch(new Request('https://example.test/api'))).status, 404);
  const asset = await h.fetch(new Request('https://example.test/app.js'), { ASSETS: { fetch: async req => new Response(new URL(req.url).pathname) } });
  assert.equal(await asset.text(), '/app.js');
  assert.equal(h.calls.length, 0);
});

const dayRequest = (query = 'date=2026-10-20') => new Request(`https://example.test/api/day?${query}`);
const unitOf = url => { const p = new URL(url).searchParams; return `${p.get('golfCourseID')}/${p.get('subCourseID') || 0}`; };

test('day returns all eleven units with bounded concurrency and per-unit failures', async () => {
  let active = 0, peak = 0;
  const h = harness(async url => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    if (unitOf(url) === '16511/0') throw new Error('private upstream detail');
    if (unitOf(url) === '16507/0') return response(times([row({ maxSlots: 0, notes: 'private' })]));
    return response(times([row({ teeTimeID: Number(new URL(url).searchParams.get('golfCourseID')), notes: 'secret' })]));
  });
  const res = await h.fetch(dayRequest());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.date, '2026-10-20');
  assert.equal(body.units.length, 11);
  assert.equal(h.calls.length, 11);
  assert.ok(peak <= 4, `peak concurrency ${peak}`);
  assert.deepEqual(body.units.map(u => `${u.courseId}/${u.subCourseId}`), ['16503/0', '16504/0', '16504/1032', '16506/0', '16507/0', '16508/0', '16509/0', '16509/1031', '16510/0', '16511/0', '16512/0']);
  const failed = body.units.filter(u => !u.ok);
  assert.deepEqual(failed.map(u => [u.courseId, u.code]), [[16507, 'UPSTREAM_RESPONSE'], [16511, 'UPSTREAM_UNAVAILABLE']]);
  assert.ok(failed.every(u => u.messageForUser && !u.teeTimes));
  const ok = body.units.find(u => u.courseId === 16504 && u.subCourseId === 1032);
  assert.deepEqual(ok.teeTimes, [{ teeTimeID: 16504, dateScheduled: '2026-10-20T08:00:00.000-04:00', availableSlots: 2, maxSlots: 4, maxPlayers: 4, priceBeforeTax: 29 }]);
  assert.equal(ok.meta.stale, false);
  assert.ok(body.meta.fetchedAt);
  assert.doesNotMatch(JSON.stringify(body), /secret|private|captcha/);
});

test('day shares the per-unit availability cache with the single-unit route', async () => {
  const h = harness();
  await h.fetch();
  const body = await (await h.fetch(dayRequest())).json();
  assert.equal(h.calls.length, 11, 'Inside 9 came from the cache');
  assert.equal(body.units.every(u => u.ok), true);
  await h.fetch(dayRequest());
  assert.equal(h.calls.length, 11);
  h.advance(60_000);
  await h.fetch(dayRequest());
  assert.equal(h.calls.length, 22);
});

test('day validates its date and parameters before fetching', async () => {
  const h = harness();
  for (const query of ['', 'date=2026-10-19', 'date=2026-10-28', 'date=2026-02-30', 'date=2026-10-20&date=2026-10-21', 'date=2026-10-20&courseId=16504']) {
    assert.equal((await h.fetch(dayRequest(query))).status, 400, query);
  }
  assert.equal((await h.fetch(dayRequest('date=2026-10-27'))).status, 200);
  assert.equal(h.calls.length, 11);
});

const meteo = (extra = {}) => ({
  latitude: 39.15, generationtime_ms: 1, timezone: 'America/New_York',
  daily: { time: ['2026-10-20', '2026-10-21'], sunrise: ['2026-10-20T07:23', '2026-10-21T07:24'], sunset: ['2026-10-20T18:22', '2026-10-21T18:21'], temperature_2m_max: [68.14, 63], temperature_2m_min: [46.6, 44], precipitation_probability_max: [10, 55], wind_speed_10m_max: [9.4, 17.6] },
  hourly: { time: ['2026-10-20T07:00', '2026-10-20T08:00', '2026-10-21T07:00'], temperature_2m: [47.4, 49.6, 44], precipitation_probability: [0, 5, null], wind_speed_10m: [3.2, 4.8, 12], weather_code: [0, 1, 61] },
  ...extra
});

test('weather reads Open-Meteo once for the county, sanitizes and caches for 30 minutes', async () => {
  const h = harness(async url => {
    const upstream = new URL(url);
    assert.equal(upstream.origin, 'https://api.open-meteo.com');
    assert.equal(upstream.searchParams.get('latitude'), '39.154');
    assert.equal(upstream.searchParams.get('timezone'), 'America/New_York');
    assert.equal(upstream.searchParams.get('forecast_days'), '9');
    return response(meteo());
  });
  const req = () => new Request('https://example.test/api/weather');
  const body = await (await h.fetch(req())).json();
  assert.deepEqual(body.days['2026-10-20'], { sunrise: '07:23', sunset: '18:22', high: 68, low: 47, rainMax: 10, windMax: 9 });
  assert.deepEqual(body.days['2026-10-21'].windMax, 18);
  assert.deepEqual(body.hours['2026-10-20'], [{ hour: 7, temp: 47, rain: 0, wind: 3, code: 0 }, { hour: 8, temp: 50, rain: 5, wind: 5, code: 1 }]);
  assert.deepEqual(body.hours['2026-10-21'], [{ hour: 7, temp: 44, rain: null, wind: 12, code: 61 }]);
  assert.deepEqual(Object.keys(body).sort(), ['days', 'hours', 'meta']);
  h.advance(30 * 60_000 - 1);
  await h.fetch(req());
  assert.equal(h.calls.length, 1);
  assert.equal((await h.fetch(new Request('https://example.test/api/weather?lat=1'))).status, 400);
});

test('weather upstream failures and bad payloads are safe 502s, with bounded stale fallback', async () => {
  for (const body of [{}, '<html>private</html>', meteo({ daily: { time: ['bad'] } }), meteo({ hourly: { time: ['2026-10-20T25:00'] } })]) {
    const h = harness(async () => response(body));
    const res = await h.fetch(new Request('https://example.test/api/weather'));
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /private|html/);
  }
  const down = harness(async () => response('private', 500));
  const res = await down.fetch(new Request('https://example.test/api/weather'));
  assert.equal(res.status, 502);
  assert.match((await res.json()).messageForUser, /Weather/);
  let fail = false;
  const h = harness(async () => { if (fail) throw new Error('down'); return response(meteo()); });
  await h.fetch(new Request('https://example.test/api/weather'));
  h.advance(30 * 60_000);
  fail = true;
  assert.equal((await (await h.fetch(new Request('https://example.test/api/weather'))).json()).meta.stale, true);
  h.advance(6 * 3600_000);
  assert.equal((await h.fetch(new Request('https://example.test/api/weather'))).status, 502);
});
