import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityPolicy, createUpstreamCache, createUpstreamService, createWorker, memoryStorage, publicRate, sanitizeFees } from '../api.mjs';

const POLICY = { fresh: 1000, maxStale: 10_000 };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function clock(start = Date.parse('2026-10-20T14:00:00Z')) {
  let t = start;
  return { now: () => t, advance(ms) { t += ms; } };
}

test('fresh hit makes no upstream call', async () => {
  const c = clock();
  const cache = createUpstreamCache({ now: c.now });
  let loads = 0;
  const loader = async () => ({ n: ++loads });
  assert.deepEqual((await cache.get('k', POLICY, loader)).value, { n: 1 });
  c.advance(999);
  const hit = await cache.get('k', POLICY, loader);
  assert.deepEqual(hit.value, { n: 1 });
  assert.equal(hit.meta.stale, false);
  assert.equal(loads, 1);
});

test('stale entry returns immediately and starts exactly one refresh for concurrent callers', async () => {
  const c = clock();
  const cache = createUpstreamCache({ now: c.now });
  let loads = 0, release;
  await cache.get('k', POLICY, async () => ({ n: ++loads }));
  c.advance(1000);
  const slow = async () => { await new Promise(resolve => { release = resolve; }); return { n: ++loads }; };
  const results = await Promise.all(Array.from({ length: 8 }, () => cache.get('k', POLICY, slow)));
  assert.ok(results.every(r => r.value.n === 1 && r.meta.stale === true), 'served stale without waiting');
  await settle();
  release();
  await cache.idle();
  assert.equal(loads, 2);
  const after = await cache.get('k', POLICY, slow);
  assert.equal(after.value.n, 2);
  assert.equal(after.meta.stale, false);
});

test('missing entry coalesces concurrent callers into one upstream fetch', async () => {
  const cache = createUpstreamCache({ now: clock().now });
  let loads = 0;
  const loader = async () => { await settle(); return ++loads; };
  const values = await Promise.all(Array.from({ length: 10 }, () => cache.get('k', POLICY, loader)));
  assert.ok(values.every(v => v.value === 1));
  assert.equal(loads, 1);
});

test('a failure blocks upstream retries for 30 seconds and is never cached', async () => {
  const c = clock();
  const cache = createUpstreamCache({ now: c.now });
  let loads = 0;
  const failing = async () => { loads++; throw new Error('down'); };
  await assert.rejects(cache.get('k', POLICY, failing), /down/);
  c.advance(29_999);
  await assert.rejects(cache.get('k', POLICY, failing), /down/);
  assert.equal(loads, 1);
  c.advance(1);
  assert.equal((await cache.get('k', POLICY, async () => { loads++; return 'ok'; })).value, 'ok');
  assert.equal(loads, 2);
});

test('entries older than maxStale wait for a fetch and fail when upstream fails', async () => {
  const c = clock();
  const cache = createUpstreamCache({ now: c.now });
  await cache.get('k', POLICY, async () => 'old');
  c.advance(10_001);
  await assert.rejects(cache.get('k', POLICY, async () => { throw new Error('down'); }), /down/);
  c.advance(30_000);
  assert.equal((await cache.get('k', POLICY, async () => 'new')).value, 'new');
});

test('upstream concurrency is capped at four', async () => {
  const cache = createUpstreamCache({ now: clock().now });
  let active = 0, peak = 0;
  const loader = async () => { active++; peak = Math.max(peak, active); await settle(); active--; return 1; };
  await Promise.all(Array.from({ length: 12 }, (_, i) => cache.get(`k${i}`, POLICY, loader)));
  assert.equal(peak, 4);
});

test('entries persist to storage with fetchedAt and reload in a new cache', async () => {
  const c = clock();
  const storage = memoryStorage();
  await createUpstreamCache({ now: c.now, storage }).get('k', POLICY, async () => ({ a: 1 }));
  assert.deepEqual(storage.map.get('k'), { value: { a: 1 }, fetchedAt: c.now() });
  const reloaded = await createUpstreamCache({ now: c.now, storage }).get('k', POLICY, async () => { throw new Error('should not fetch'); });
  assert.deepEqual(reloaded.value, { a: 1 });
});

test('availability freshness depends on the Eastern day offset', () => {
  const now = Date.parse('2026-10-20T03:30:00Z'); // 11:30pm Oct 19 Eastern
  assert.equal(availabilityPolicy('2026-10-19', now).fresh, 2 * 60_000);
  assert.equal(availabilityPolicy('2026-10-20', now).fresh, 2 * 60_000);
  assert.equal(availabilityPolicy('2026-10-21', now).fresh, 10 * 60_000);
  assert.equal(availabilityPolicy('2026-10-26', now).maxStale, 30 * 60_000);
});

// Rate cards as TenFore returned them on 2026-10-19 (abridged; member rows kept to prove they are dropped).
const all = [0, 1, 2, 3, 4, 5, 6], weekdays = [1, 2, 3, 4, 5], weekend = [6, 0];
const fee = (title, startTime, endTime, price9, price18, days = all, extra = {}) => ({ teeFeeID: 1, title, startDate: null, endDate: null, startTime, endTime, everyone: true, price9, price18, subCourseID: null, days: days.map(index => ({ index, dayName: 'x' })), customerTypes: [], memberships: [], ...extra });
const northwest = sanitizeFees({ teeFees: [
  fee('Public', '12:00 AM', '11:00 PM', 70, 70),
  fee('Public Inside 9 Morning', '12:01 AM', '2:59 PM', 29, 29, weekdays),
  fee('Public Inside 9 Afternoon', '3:00 PM', '11:59 PM', 27, 27),
  fee('Public Inside 9 W/E Morning', '12:00 AM', '2:59 PM', 33, 33, weekend),
  fee('Senior Inside 9 W/D AM', '12:06 AM', '2:59 PM', 24.65, 24.65, weekdays, { everyone: false }),
  fee('Eagle', '12:00 AM', '11:59 PM', 0, 0, all, { everyone: false })
], status: { successful: true } }).fees;
const needwood = sanitizeFees({ teeFees: [
  fee('Public', '12:00 AM', '11:47 PM', 74, 74),
  fee('Public Exec 9 W/D', '12:01 AM', '11:59 PM', 24, 24, weekdays),
  fee('Public Exec 9 W/E', '12:35 AM', '11:59 PM', 29, 29, weekend),
  fee('Holiday', '12:00 AM', '11:59 PM', 90, 90, all, { startDate: '2026-09-14T00:00:00.000+0', endDate: '2026-09-14T00:00:00.000+0' })
] }).fees;
const rattlewood = sanitizeFees({ teeFees: [fee('Public', '12:00 AM', '11:58 PM', 35, 50)] }).fees;
const sligo = sanitizeFees({ teeFees: [fee('Public', '12:00 AM', '11:59 PM', 27, 500)] }).fees;
const INSIDE = { courseId: 16504, subCourseId: 1032 }, NW = { courseId: 16504, subCourseId: 0 };
const EXEC = { courseId: 16509, subCourseId: 1031 }, NEEDWOOD = { courseId: 16509, subCourseId: 0 };

test('rate card keeps only public rows with parsed times, days and dates', () => {
  assert.equal(northwest.length, 4);
  assert.deepEqual(northwest[1], { title: 'Public Inside 9 Morning', start: 1, end: 899, days: [1, 2, 3, 4, 5], startDate: null, endDate: null, price9: 29, price18: 29 });
  assert.equal(needwood[3].startDate, '2026-09-14');
  assert.doesNotMatch(JSON.stringify(northwest), /Senior|Eagle|memberships/);
  assert.throws(() => sanitizeFees({ status: { successful: true } }));
});

test('publicRate picks the right Inside 9, Exec 9 and main-course rates', () => {
  assert.equal(publicRate(northwest, INSIDE, '2026-10-20T07:30:00.000-04:00'), 29, 'Inside 9 weekday morning');
  assert.equal(publicRate(northwest, INSIDE, '2026-10-20T14:59:00.000-04:00'), 29);
  assert.equal(publicRate(northwest, INSIDE, '2026-10-20T15:00:00.000-04:00'), 27, 'Inside 9 afternoon');
  assert.equal(publicRate(northwest, INSIDE, '2026-10-24T09:00:00.000-04:00'), 33, 'Inside 9 weekend morning');
  assert.equal(publicRate(northwest, INSIDE, '2026-10-25T16:00:00.000-04:00'), 27, 'weekend afternoon');
  assert.equal(publicRate(northwest, NW, '2026-10-20T07:28:00.000-04:00'), 70, 'main Northwest ignores Inside 9 rows');
  assert.equal(publicRate(northwest, NW, '2026-10-20T23:30:00.000-04:00'), null, 'outside every window');
  assert.equal(publicRate(needwood, EXEC, '2026-10-24T10:00:00.000-04:00'), 29, 'Exec 9 weekend');
  assert.equal(publicRate(needwood, EXEC, '2026-10-21T10:00:00.000-04:00'), 24, 'Exec 9 weekday');
  assert.equal(publicRate(needwood, NEEDWOOD, '2026-10-21T10:00:00.000-04:00'), 74);
  assert.equal(publicRate(needwood, NEEDWOOD, '2026-09-14T10:00:00.000-04:00'), 74, 'the dated row applies on its day, but the narrower Public window still wins');
  assert.equal(publicRate(rattlewood, { courseId: 16511, subCourseId: 0 }, '2026-10-21T10:00:00-04:00'), 50, 'Rattlewood 18');
  assert.equal(publicRate(sligo, { courseId: 16512, subCourseId: 0 }, '2026-10-21T10:00:00-04:00'), 27, 'Sligo is 9 holes; the $500 18-hole price is ignored');
  assert.equal(publicRate(sligo, { courseId: 16512, subCourseId: 0, holes: 18 }, '2026-10-21T10:00:00-04:00'), null, 'prices above $300 are ignored');
  assert.equal(publicRate(null, NW, '2026-10-21T10:00:00-04:00'), null);
});

test('narrowest matching window wins and date ranges limit rows', () => {
  const fees = sanitizeFees({ teeFees: [
    fee('Public', '12:00 AM', '11:59 PM', 60, 60),
    fee('Public Twilight', '3:00 PM', '11:59 PM', 40, 40),
    fee('Public Fall Special', '12:00 AM', '11:59 PM', 50, 50, all, { startDate: '2026-10-01T00:00:00.000+0', endDate: '2026-10-31T00:00:00.000+0' })
  ] }).fees;
  const unit = { courseId: 16503, subCourseId: 0 };
  assert.equal(publicRate(fees, unit, '2026-10-20T16:00:00-04:00'), 40);
  assert.equal(publicRate(fees, unit, '2026-11-02T10:00:00-05:00'), 60);
  assert.equal(publicRate(fees, unit, '2026-10-20T10:00:00-04:00'), 60, 'equal windows keep the first row');
});

test('tee times carry a feed price or a rate-card price, with its source', async () => {
  const now = () => Date.parse('2026-10-20T14:00:00Z');
  const service = createUpstreamService({ now, fetchImpl: async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('/TeeFees')) return new Response(JSON.stringify({ teeFees: [fee('Public', '12:00 AM', '11:00 PM', 70, 70), fee('Public Inside 9 Morning', '12:01 AM', '2:59 PM', 29, 29, weekdays)] }));
    const priced = u.searchParams.get('subCourseID') === '1032';
    return new Response(JSON.stringify({ status: { successful: true }, teeTimes: [{ teeTimeID: 7, dateScheduled: '2026-10-20T08:00:00.000-4', availableSlots: 4, maxSlots: 4, listingPrice: priced ? 31 : 0 }] }));
  } });
  const worker = createWorker({ now, upstream: service, cacheStorage: null });
  const get = async q => (await (await worker.fetch(new Request(`https://x.test/api/availability?${q}`), {})).json()).teeTimes[0];
  assert.deepEqual([(await get('courseId=16504&date=2026-10-20')).rate, (await get('courseId=16504&date=2026-10-20')).rateSource], [70, 'ratecard']);
  const inside = await get('courseId=16504&subCourseId=1032&date=2026-10-20');
  assert.deepEqual([inside.rate, inside.rateSource], [31, 'teetime'], 'the tee time feed price wins');
});
