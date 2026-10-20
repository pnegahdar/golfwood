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

test('main courses use subcourse zero and month rollover sends the next day', async () => {
  const h = harness(async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('subCourseID'), '0');
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
