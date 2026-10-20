const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const testSource = source.replace(/  boot\(\);\s*\}\)\(\);\s*$/, `
  loadWeather = async function () { return { hours: {}, days: {} }; };
  globalThis.hosted = { state, hostedApi, loadCourses, loadTimes, normalizeTime,
    bookingCourseUrl, renderTimeRow, renderHeader, renderStatus, renderTimes, renderEmpty,
    bindEvents, requestKey, courseKey, ensureSelectedTimes, retrySelectedTimes,
    setSelectedDate, todayISO, initialDate, nextSevenChoices, slotMinutes };
})();`);
const course = { id: 16504, subCourseId: 1032, label: 'Northwest Inside 9', fullName: 'Northwest Golf Course', vanityName: 'northwest', defaultHoles: 9, maxPlayers: 4, maxBookingDaysOut: 7 };
function harness(now = '2026-10-20T14:00:00Z') {
  let clock = Date.parse(now);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const shadow = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const window = { __MCG_HOSTED_APP__: { apiRoot: '/api' }, setTimeout, clearTimeout };
  Object.defineProperty(window, 'grecaptcha', { get() { throw new Error('Hosted app must never invoke CAPTCHA'); } });
  const calls = [];
  const context = vm.createContext({
    window, document: { getElementById: () => null, querySelectorAll() { throw new Error('No CAPTCHA discovery'); } },
    location: { hostname: 'mcgtee.com', href: 'https://mcgtee.com/' },
    localStorage: { getItem: () => null, setItem() {} },
    URL, Headers, AbortController, Date: Clock, console, setTimeout, clearTimeout,
    fetch: async (...args) => { calls.push(args); return { ok: true, status: 200, text: async () => JSON.stringify({ teeTimes: [{ teeTimeID: 123, dateScheduled: '2026-10-20T08:00:00.000-04:00', availableSlots: 2, maxSlots: 4, priceBeforeTax: null }], status: { successful: true }, meta: { fetchedAt: new Clock().toISOString(), stale: false } }) }; }
  });
  vm.runInContext(testSource, context);
  const app = context.hosted;
  Object.assign(app.state, { shadow, courses: [course], selectedKey: app.courseKey(course), date: '2026-10-20', players: 2 });
  return { app, context, window, shadow, calls, advance(ms) { clock += ms; } };
}

test('hosted is live on its own origin and uses only same-origin public API without CAPTCHA, cookies or TenFore headers', async () => {
  const h = harness();
  assert.equal(h.app.state.hosted, true);
  assert.equal(h.app.state.live, true);
  const result = await h.app.loadTimes(course, '2026-10-20');
  assert.equal(h.calls.length, 1);
  const [url, options] = h.calls[0];
  assert.equal(url, 'https://mcgtee.com/api/availability?courseId=16504&subCourseId=1032&date=2026-10-20');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.deepEqual(Object.keys(options.headers), ['Accept']);
  assert.equal(result[0].available, 2);
  assert.equal(result[0].booked, 2);
  assert.equal(result[0].maxPlayers, 4);
  assert.equal(result[0].price, undefined);
  assert.equal(h.app.state.debugByCourse.get(h.app.requestKey(course)).used, 'BookingEngine/Get');
});

test('hosted metadata reuses existing normalization and remembers stale state', async () => {
  const h = harness();
  h.context.fetch = async url => {
    assert.equal(url, 'https://mcgtee.com/api/courses');
    return { ok: true, text: async () => JSON.stringify({ companyCourses: [{ golfCourseID: 16504, courseName: 'Northwest Golf Course', vanityName: 'northwest', maxBookingDaysOut: 7, subCourses: [{ subCourseID: 1032, name: 'Inside 9' }] }], meta: { fetchedAt: '2026-10-20T12:00:00Z', stale: true } }) };
  };
  const courses = await h.app.loadCourses();
  assert.equal(courses.length, 2);
  assert.equal(courses[0].subCourseId, 1032);
  assert.equal(h.app.state.coursesMeta.stale, true);
  assert.match(h.app.renderStatus(), /Course details are cached/);
});

test('hosted links keep players and holes in native course URLs and use natural new-tab anchors', async () => {
  const h = harness();
  const [slot] = await h.app.loadTimes(course);
  const url = new URL(h.app.bookingCourseUrl(slot));
  assert.equal(url.pathname, '/northwest/tee-time/123');
  assert.equal(url.searchParams.get('players'), '2');
  assert.equal(url.searchParams.get('holes'), '9');
  const html = h.app.renderTimeRow(slot, course);
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(html, /data-book-slot/);
  assert.doesNotMatch(html, /\$0/);
  assert.match(html, /2\/4/);
  assert.match(h.app.renderTimes(course, [slot]), /Confirm players, holes, and final price/);
  assert.match(h.app.renderHeader(course), /MCG Tee/);
  assert.doesNotMatch(h.app.renderHeader(course), /data-action="close"|live availability/);
  h.app.state.players = 3;
  assert.doesNotMatch(h.app.renderTimeRow(slot, course), />Book<\/a>/);
});

test('empty, failed, stale and current cached lookups remain distinct with real recovery links', async () => {
  const h = harness();
  const key = h.app.requestKey(course);
  h.app.state.metaByRequest.set(key, { fetchedAt: '2026-10-20T13:58:00Z', stale: true });
  h.app.state.timesByCourse.set(key, []);
  assert.match(h.app.renderStatus(), /Cached availability.*older check/);
  assert.doesNotMatch(h.app.renderStatus(), /live availability/);
  assert.match(h.app.renderEmpty(course), /No tee times available/);
  h.context.fetch = async () => ({ ok: false, status: 503, text: async () => JSON.stringify({ successful: false, code: 'UPSTREAM_TIMEOUT', messageForUser: 'TenFore took too long. Please retry.' }) });
  await h.app.retrySelectedTimes();
  assert.match(h.app.renderEmpty(course), /Couldn’t check tee times/);
  assert.match(h.app.renderEmpty(course), /href="https:\/\/fox.tenfore.golf\/northwest" target="_blank"/);
  assert.doesNotMatch(h.app.renderEmpty(course), /data-action="close"/);
});

test('client cache refreshes after 60 seconds on selection, stale responses retry, and there is no fallback to verified endpoints', async () => {
  const h = harness();
  await h.app.ensureSelectedTimes();
  await h.app.ensureSelectedTimes();
  assert.equal(h.calls.length, 1);
  h.advance(60_001);
  await h.app.ensureSelectedTimes();
  assert.equal(h.calls.length, 2);
  h.app.state.metaByRequest.get(h.app.requestKey(course)).stale = true;
  await h.app.ensureSelectedTimes();
  assert.equal(h.calls.length, 3);
  h.context.fetch = async () => ({ ok: true, text: async () => '{"successful":false,"messageForUser":"Please retry."}' });
  await assert.rejects(h.app.loadTimes(course), /Please retry/);
  assert.equal(h.calls.length, 3);
});

test('hosted uses Eastern dates and times, tomorrow after 5pm, and correct DST calendar labels', async () => {
  const h = harness('2026-11-02T01:30:00Z'); // November 1, 8:30pm Eastern, regardless of visitor timezone.
  assert.equal(h.app.todayISO(), '2026-11-01');
  assert.equal(h.app.initialDate(), '2026-11-02');
  const choices = h.app.nextSevenChoices();
  assert.equal(choices[0].value, '2026-11-01');
  assert.equal(choices[0].label, 'Sun');
  assert.equal(choices[7].value, '2026-11-08');
  assert.equal(choices[7].label, 'Sun');
  const slot = h.app.normalizeTime({ teeTimeID: 1, dateScheduled: '2026-11-02T13:00:00Z', availableSlots: 4, maxPlayers: 4 }, course);
  assert.match(slot.timeText, /8:00/);
  assert.equal(h.app.slotMinutes(slot), 480);
  for (const date of ['2026-11-00', '2026-11-31', '2026-10-31', '2026-11-09', 'nonsense']) {
    await h.app.setSelectedDate(date);
    assert.match(h.app.renderEmpty(course), /booking window/);
  }
  assert.equal(h.calls.length, 0);
});

test('request metadata remains bound to captured course and date when selection changes', async () => {
  const h = harness();
  let resolve;
  h.context.fetch = () => new Promise(yes => { resolve = yes; });
  const pending = h.app.loadTimes(course, '2026-10-20');
  h.app.state.date = '2026-10-21';
  resolve({ ok: true, text: async () => '{"teeTimes":[],"status":{"successful":true},"meta":{"fetchedAt":"2026-10-20T14:00:00Z","stale":true}}' });
  await pending;
  assert.equal(h.app.state.metaByRequest.has(h.app.requestKey(course, '2026-10-20')), true);
  assert.equal(h.app.state.metaByRequest.has(h.app.requestKey(course, '2026-10-21')), false);
});

test('hosted API rejects cross-origin configuration and malformed responses', async () => {
  const h = harness();
  h.window.__MCG_HOSTED_APP__.apiRoot = 'https://swan.tenfore.golf/api';
  await assert.rejects(h.app.hostedApi('availability'), /this site’s origin/);
  h.window.__MCG_HOSTED_APP__.apiRoot = '/api';
  h.context.fetch = async () => ({ ok: true, text: async () => '<html>oops</html>' });
  await assert.rejects(h.app.loadTimes(course), error => error.code === 'API_RESPONSE');
  h.context.fetch = async () => ({ ok: true, text: async () => '{"teeTimes":[],"meta":{"fetchedAt":"2026-10-20T14:00:00Z","stale":false}}' });
  await assert.rejects(h.app.loadTimes(course), error => error.code === 'API_RESPONSE');
});

test('hosted client has a 15-second deadline and aborts a stalled read', async () => {
  const h = harness();
  let deadline, signal;
  h.window.setTimeout = (fn, ms) => { deadline = { fn, ms }; return 1; };
  h.window.clearTimeout = () => {};
  h.context.fetch = (url, options) => { signal = options.signal; return new Promise(() => {}); };
  const pending = h.app.hostedApi('courses');
  const checked = assert.rejects(pending, error => error.code === 'API_TIMEOUT');
  assert.equal(deadline.ms, 15000);
  deadline.fn();
  await checked;
  assert.equal(signal.aborted, true);
});
