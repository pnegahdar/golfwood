const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const testSource = source.replace(/  boot\(\);\s*\}\)\(\);\s*$/, `
  render = function () {};
  globalThis.booking = { state, normalizeTime, bookingUrl, bookingCourseUrl,
    bookSlot, primeTenForeCourse, requestKey, renderBookingStatus, renderTimeRow };
})();`);

function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

function harness({ routerAvailable = true, storeAvailable = true } = {}) {
  const changes = [], pushes = [], assigned = [];
  let removed = false;
  const store = {
    setGolfCourse(course) { changes.push(['course', course.golfCourseID]); },
    setSubCourseId(id) { changes.push(['subcourse', id]); }
  };
  const router = {
    currentRoute: { value: { path: '/mcggolf', query: {} } },
    async push(target) {
      pushes.push(target);
      const url = new URL(target, 'https://fox.tenfore.golf');
      this.currentRoute.value = { path: url.pathname, query: Object.fromEntries(url.searchParams) };
    }
  };
  const app = {
    config: { globalProperties: { $nextTick: async () => changes.push(['tick']), ...(routerAvailable ? { $router: router } : {}) } },
    _context: { provides: { pinia: { _s: new Map(storeAvailable ? [['mainStore', store]] : []), state: {} } } }
  };
  const root = { remove() { removed = true; } };
  const window = { setTimeout, clearTimeout, location: { assign(url) { assigned.push(url); } } };
  const context = vm.createContext({
    window,
    document: {
      getElementById(id) { return id === '__nuxt' ? { __vue_app__: app } : id === 'mcg-tee-pressure-root' ? root : null; },
      querySelectorAll() { return []; }
    },
    location: { hostname: 'fox.tenfore.golf', href: 'https://fox.tenfore.golf/mcggolf' },
    localStorage: { getItem: () => null, setItem() {} },
    URL, Headers, AbortController, setTimeout, clearTimeout,
    console: { warn() {} },
    fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ golfCourseID: 16504, vanityName: 'northwest' }) })
  });
  vm.runInContext(testSource, context);
  const api = context.booking;
  const course = { id: 16504, subCourseId: 1032, label: 'Northwest Inside 9', vanityName: 'northwest', defaultHoles: 9, maxPlayers: 4 };
  const slot = api.normalizeTime({ teeTimeId: 123, dateScheduled: '2026-10-20T08:00:00-04:00', spots: 4 }, course);
  Object.assign(api.state, { courses: [course], selectedKey: '16504:1032', date: '2026-10-20', players: 3 });
  api.state.timesByCourse.set(api.requestKey(course), [slot]);
  return { api, slot, course, router, changes, pushes, assigned, context, window, removed: () => removed };
}

test('booking URLs carry players, holes and back nine, with a course-scoped native link', () => {
  const h = harness();
  h.slot.back9 = true;
  const url = new URL(h.api.bookingUrl(h.slot));
  assert.equal(url.pathname, '/tee-time/123');
  assert.equal(url.searchParams.get('players'), '3');
  assert.equal(url.searchParams.get('holes'), '9');
  assert.equal(url.searchParams.get('back9'), 'true');
  assert.equal(url.searchParams.get('backToSearch'), 'true');
  assert.equal(new URL(h.api.bookingCourseUrl(h.slot)).pathname, '/northwest/tee-time/123');
  assert.match(h.api.renderTimeRow(h.slot, h.course), /href="https:\/\/fox.tenfore.golf\/northwest\/tee-time\/123/);
});

test('booking primes the exact course and subcourse, then verifies routing before removing overlay', async () => {
  const h = harness();
  await h.api.bookSlot('123');
  assert.deepEqual(h.changes, [['course', 16504], ['subcourse', 1032], ['tick']]);
  assert.equal(h.pushes.length, 1);
  assert.match(h.pushes[0], /players=3&holes=9&backToSearch=true/);
  assert.equal(h.removed(), true);
  assert.equal(h.api.state.disposed, true);
  assert.deepEqual(h.assigned, []);
});

test('main-course booking explicitly clears an old subcourse', async () => {
  const h = harness();
  h.slot.subCourseId = null;
  await h.api.bookSlot('123');
  assert.deepEqual(h.changes[1], ['subcourse', 0]);
});

test('duplicate clicks only launch once and retain the player count captured on click', async () => {
  const h = harness();
  const pending = deferred();
  h.context.fetch = () => pending.promise;
  const first = h.api.bookSlot('123');
  assert.equal(h.api.state.bookingSlotId, '123');
  assert.match(h.api.renderTimeRow(h.slot, h.course), /Opening…/);
  h.api.state.players = 1;
  await h.api.bookSlot('123');
  pending.resolve({ ok: true, status: 200, text: async () => '{"golfCourseID":16504}' });
  await first;
  assert.equal(h.pushes.length, 1);
  assert.match(h.pushes[0], /players=3/);
});

test('missing native router or store leaves an actionable overlay instead of navigating with wrong context', async () => {
  for (const options of [{ routerAvailable: false }, { storeAvailable: false }]) {
    const h = harness(options);
    await h.api.bookSlot('123');
    assert.equal(h.removed(), false);
    assert.equal(h.api.state.bookingSlotId, '');
    assert.equal(h.pushes.length, 0);
    assert.deepEqual(h.assigned, []);
    assert.match(h.api.renderBookingStatus(), /role="alert"/);
    assert.match(h.api.renderBookingStatus(), /\/northwest\/tee-time\/123/);
  }
});

test('API course mismatch and failed navigation retain overlay and allow retry', async () => {
  const h = harness();
  h.context.fetch = async () => ({ ok: true, status: 200, text: async () => '{"golfCourseID":16509}' });
  await h.api.bookSlot('123');
  assert.deepEqual(h.changes, []);
  assert.equal(h.removed(), false);
  assert.match(h.api.state.bookingError, /Couldn’t open booking/);
  h.context.fetch = async () => ({ ok: true, status: 200, text: async () => '{"golfCourseID":16504}' });
  h.router.push = async () => ({ type: 4 });
  await h.api.bookSlot('123');
  assert.equal(h.removed(), false);
  h.router.push = async function (target) {
    const url = new URL(target, 'https://fox.tenfore.golf');
    this.currentRoute.value = { path: url.pathname, query: Object.fromEntries(url.searchParams) };
  };
  await h.api.bookSlot('123');
  assert.equal(h.removed(), true);
  assert.equal(h.api.state.bookingError, '');
});

test('silent router redirect cannot be mistaken for the selected booking', async () => {
  const h = harness();
  h.router.push = async () => { h.router.currentRoute.value = { path: '/courses', query: {} }; };
  await h.api.bookSlot('123');
  assert.equal(h.removed(), false);
  assert.match(h.api.state.bookingError, /Couldn’t open booking/);
});

test('reopening the overlay on the same booking can accept an already-correct route', async () => {
  const h = harness();
  h.router.currentRoute.value = { path: '/tee-time/123', query: { players: '3', holes: '9', backToSearch: 'true' } };
  h.router.push = async () => ({ type: 16 });
  await h.api.bookSlot('123');
  assert.equal(h.removed(), true);
  assert.equal(h.api.state.bookingError, '');
});

test('preview Book links open the real course instead of a synthetic tee-time ID', () => {
  const h = harness();
  h.api.state.live = false;
  const html = h.api.renderTimeRow(h.slot, h.course);
  assert.match(html, /href="https:\/\/fox.tenfore.golf\/northwest"/);
  assert.doesNotMatch(html, /href="[^"]+\/tee-time\//);
});

test('closing the overlay during course lookup cancels the handoff', async () => {
  const h = harness();
  const pending = deferred();
  h.context.fetch = () => pending.promise;
  const booking = h.api.bookSlot('123');
  h.window.__mcgTeePressureCleanup();
  pending.resolve({ ok: true, status: 200, text: async () => '{"golfCourseID":16504}' });
  await booking;
  assert.deepEqual(h.changes, []);
  assert.deepEqual(h.pushes, []);
});

test('unavailable rows and missing IDs cannot open a booking', async () => {
  const h = harness();
  h.slot.available = 2;
  await h.api.bookSlot('123');
  h.slot.available = 4;
  h.slot.teeTimeId = null;
  await h.api.bookSlot('123');
  assert.deepEqual(h.changes, []);
  assert.deepEqual(h.pushes, []);
});

test('search bookedPlayers reduces availability before enabling Book for the selected group', () => {
  const h = harness();
  const partial = h.api.normalizeTime({ teeTimeId: 456, dateScheduled: '2026-10-20T08:00:00-04:00', maxPlayers: 4, bookedPlayers: 2, priceBeforeTax: 29 }, h.course);
  assert.equal(partial.available, 2);
  assert.equal(partial.booked, 2);
  assert.equal(partial.assumedAvailability, false);
  assert.doesNotMatch(h.api.renderTimeRow(partial, h.course), /data-book-slot/);
  assert.match(h.api.renderTimeRow(partial, h.course), /2 left/);
  const full = h.api.normalizeTime({ teeTimeId: 457, dateScheduled: '2026-10-20T08:00:00-04:00', maxPlayers: 4, bookedPlayers: 4 }, h.course);
  assert.equal(full.available, 0);
});
