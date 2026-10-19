const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const exportsForTest = `globalThis.availability = {
  state, recaptchaSiteKey, ensureRecaptcha, recaptchaToken, api, lookupError,
  loadTimes, loadSearchTimes, loadV4Times, requestKey, courseKey,
  renderEmpty, renderStatus, render, bindEvents, ensureSelectedTimes,
  retrySelectedTimes, ensureCourses, setSelectedDate, boot,
  setWeatherLoader(fn) { loadWeather = fn; }
};`;
assert.match(source, /  boot\(\);\s*\}\)\(\);\s*$/);
const testSource = source.replace(/  boot\(\);\s*\}\)\(\);\s*$/, `${exportsForTest}\n})();`);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => typeof body === 'string' ? body : JSON.stringify(body)
});

function harness() {
  let time = 0, nextTimer = 0;
  const timers = new Map();
  const scripts = [];
  const shadow = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const preview = { shadowRoot: shadow, innerHTML: '' };
  const setTimeout = (fn, ms) => {
    const id = ++nextTimer;
    timers.set(id, { fn, due: time + ms });
    return id;
  };
  const clearTimeout = id => timers.delete(id);
  const document = {
    getElementById: id => id === 'mcg-preview-root' ? preview : null,
    querySelectorAll: selector => selector === 'script[src]' ? scripts.filter(s => !s.removed) : [],
    createElement() {
      const listeners = new Map();
      return {
        dataset: {}, style: {}, removed: false,
        addEventListener(name, fn) {
          if (!listeners.has(name)) listeners.set(name, new Set());
          listeners.get(name).add(fn);
        },
        removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
        emit(name) { for (const fn of [...(listeners.get(name) || [])]) fn(); },
        remove() { this.removed = true; }
      };
    },
    head: { appendChild(script) { scripts.push(script); } }
  };
  const window = {
    __NUXT__: { config: { public: { recaptchaPolicySiteKey: 'current-key' } } },
    setTimeout, clearTimeout
  };
  const context = vm.createContext({
    window, document,
    location: { hostname: 'fox.tenfore.golf', href: 'https://fox.tenfore.golf/mcggolf' },
    localStorage: { getItem: () => null, setItem() {} },
    URL, Headers, AbortController, console, setTimeout, clearTimeout,
    fetch: async () => { throw new Error('Unexpected fetch'); }
  });
  vm.runInContext(testSource, context, { filename: 'app.js' });
  const app = context.availability;
  app.state.shadow = shadow;
  // Weather must remain independent of the tee-time outcome.
  app.setWeatherLoader(async () => ({ hours: {}, days: {} }));
  return {
    app, window, document, shadow, scripts, timers, context,
    fetch(fn) { context.fetch = fn; },
    script(src) {
      const script = document.createElement('script');
      script.src = src;
      scripts.push(script);
      return script;
    },
    advance(ms) {
      const end = time + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        timers.delete(next[0]);
        time = next[1].due;
        next[1].fn();
      }
      time = end;
    }
  };
}

function captcha(h, key = 'current-key', enterprise = true, execute = async () => 'fresh-token') {
  const script = h.script(`https://www.google.com/recaptcha/${enterprise ? 'enterprise' : 'api'}.js?render=${key}`);
  const api = { ready: fn => fn(), execute };
  h.window.grecaptcha = enterprise ? { enterprise: api } : api;
  return { script, api };
}

const courseA = { id: 16509, label: 'Needwood', fullName: 'Needwood Golf Course', vanityName: 'needwood', defaultHoles: 18, maxPlayers: 4 };
const courseB = { id: 16503, label: 'Falls Road', fullName: 'Falls Road Golf Course', vanityName: 'fallsroad', defaultHoles: 18, maxPlayers: 4 };
function select(h, course = courseA, date = '2026-10-20') {
  Object.assign(h.app.state, { courses: [courseA, courseB], selectedKey: h.app.courseKey(course), date });
}
const rawSlot = date => ({ teeTimeID: 91, dateScheduled: `${date}T09:00:00`, spots: 4, price: 47 });

test('runtime key rotation loads the selected key even when execute already exists', async () => {
  const h = harness();
  const executions = [];
  captcha(h, 'old-key', true, async key => { executions.push(key); return `token-${executions.length}`; });
  assert.equal(h.app.recaptchaSiteKey(), 'current-key');
  const first = h.app.ensureRecaptcha('current-key');
  assert.equal(h.app.ensureRecaptcha('current-key'), first, 'deduplicates per-key initialization');
  const newScript = h.scripts.at(-1);
  assert.match(newScript.src, /enterprise\.js\?render=current-key$/);
  assert.equal(executions.length, 0);
  newScript.emit('load');
  const api = await first;
  assert.equal(api, h.window.grecaptcha.enterprise);
  assert.equal(await h.app.recaptchaToken('teetimes_search'), 'token-1');
  assert.equal(await h.app.recaptchaToken('bookingenginev4_booking_times'), 'token-2');
  assert.deepEqual(executions, ['current-key', 'current-key']);
});

test('discovers explicit render scripts, ignores explicit/onload-only, and reports a missing key', async () => {
  const h = harness();
  delete h.window.__NUXT__;
  h.script('https://www.google.com/recaptcha/enterprise.js?render=explicit');
  h.script('https://www.google.com/recaptcha/enterprise.js?render=onload');
  h.script('https://www.google.com/recaptcha/api.js?onload=ready');
  h.script('https://example.com/recaptcha/api.js?render=untrusted');
  assert.throws(() => h.app.recaptchaSiteKey(), error => error.code === 'CAPTCHA_KEY_MISSING');
  let executions = 0;
  const { api } = captcha(h, 'native-standard', false, async key => { executions++; assert.equal(key, 'native-standard'); return 'standard-token'; });
  h.window.grecaptcha.enterprise = { execute() { throw new Error('wrong API'); }, ready: fn => fn() };
  assert.equal(h.app.recaptchaSiteKey(), 'native-standard');
  assert.equal(await h.app.ensureRecaptcha('native-standard'), api);
  assert.equal(await h.app.recaptchaToken('teetimes_search'), 'standard-token');
  assert.equal(executions, 1);
  assert.equal(h.scripts.length, 5, 'reuses already-loaded standard script without waiting for another load event');
});

test('script load waits for library readiness before requiring execute', async () => {
  const h = harness();
  let onReady;
  const pending = h.app.ensureRecaptcha('current-key');
  h.window.grecaptcha = { enterprise: { ready(fn) { onReady = fn; } } };
  h.scripts.at(-1).emit('load');
  assert.equal(typeof onReady, 'function');
  const initialized = { ready: fn => fn(), execute: async () => 'initialized-token' };
  h.window.grecaptcha.enterprise = initialized;
  onReady();
  assert.equal(await pending, initialized);
  assert.equal(await h.app.recaptchaToken('teetimes_search'), 'initialized-token');
});

test('a failed native script remains a discoverable key for a fresh retry without runtime config', async () => {
  const h = harness();
  delete h.window.__NUXT__;
  captcha(h, 'native-key', true, async () => { throw new Error('temporary verification failure'); });
  await assert.rejects(h.app.recaptchaToken('teetimes_search'), error => error.code === 'CAPTCHA_EXECUTE');
  assert.equal(h.app.recaptchaSiteKey(), 'native-key');
  const retry = h.app.recaptchaToken('teetimes_search');
  const newScript = h.scripts.at(-1);
  assert.match(newScript.src, /render=native-key$/);
  h.window.grecaptcha.enterprise.execute = async () => 'retried-token';
  newScript.emit('load');
  assert.equal(await retry, 'retried-token');
});

test('captcha script error and load timeout both reset initialization for retry', async () => {
  const h = harness();
  const failed = h.app.ensureRecaptcha('current-key');
  const failedCheck = assert.rejects(failed, error => error.code === 'CAPTCHA_LOAD');
  h.scripts.at(-1).emit('error');
  await failedCheck;
  assert.equal(h.scripts.at(-1).removed, true);
  const timedOut = h.app.ensureRecaptcha('current-key');
  const timeoutCheck = assert.rejects(timedOut, error => error.code === 'CAPTCHA_TIMEOUT');
  h.advance(10000);
  await timeoutCheck;
  assert.equal(h.scripts.at(-1).removed, true);
  const retry = h.app.ensureRecaptcha('current-key');
  h.window.grecaptcha = { enterprise: { ready: fn => fn(), execute: async () => 'retry-token' } };
  h.scripts.at(-1).emit('load');
  await retry;
  assert.equal(await h.app.recaptchaToken('teetimes_search'), 'retry-token');
  assert.equal(h.scripts.length, 3);
  assert.equal(h.timers.size, 0);
});

test('a previously loaded but unusable script cannot leave readiness pending forever', async () => {
  const h = harness();
  const native = h.script('https://www.google.com/recaptcha/enterprise.js?render=current-key');
  h.window.grecaptcha = { enterprise: { execute: async () => 'not-ready', ready() {} } };
  const pending = h.app.ensureRecaptcha('current-key');
  const check = assert.rejects(pending, error => error.code === 'CAPTCHA_TIMEOUT');
  h.advance(10000);
  await check;
  assert.equal(native.dataset.mcgRecaptchaFailed, 'true');
  const retry = h.app.ensureRecaptcha('current-key');
  assert.notEqual(h.scripts.at(-1), native);
  h.window.grecaptcha.enterprise.ready = fn => fn();
  h.scripts.at(-1).emit('load');
  await retry;
});

test('captcha execution has a deadline, rejects empty tokens, and never starts API fallback', async () => {
  const h = harness();
  select(h);
  let calls = 0;
  h.fetch(async () => { calls++; return response({ data: [] }); });
  captcha(h, 'current-key', true, () => new Promise(() => {}));
  const pending = h.app.loadTimes(courseA);
  const check = assert.rejects(pending, error => error.code === 'CAPTCHA_TIMEOUT');
  await flush();
  h.advance(10000);
  await check;
  assert.equal(calls, 0);
  const debug = h.app.state.debugByCourse.get(h.app.requestKey(courseA));
  assert.ok(debug.search.error);
  assert.equal(debug.v4.error, '', 'both endpoints need the same failed verification');
  captcha(h, 'current-key', true, async () => '  ');
  const emptyCheck = assert.rejects(h.app.recaptchaToken('teetimes_search'), error => error.code === 'CAPTCHA_EMPTY');
  await flush();
  h.advance(1000);
  await emptyCheck;
  assert.equal(calls, 0);
});

test('a transient empty token at page startup retries once after a pause without API fallback', async () => {
  for (const empty of ['', undefined]) {
    const h = harness();
    select(h);
    let executions = 0, requests = 0;
    captcha(h, 'current-key', true, async () => ++executions === 1 ? empty : 'recovered-token');
    h.fetch(async (url, options) => {
      requests++;
      assert.match(url, /TeeTimes\/Search/);
      assert.equal(options.headers.get('X-Recaptcha-Token'), 'recovered-token');
      return response({ data: [rawSlot('2026-10-20')] });
    });
    const pending = h.app.loadTimes(courseA);
    await flush();
    assert.equal(requests, 0);
    assert.equal(executions, 1);
    h.advance(999);
    await flush();
    assert.equal(executions, 1);
    h.advance(1);
    const times = await pending;
    assert.equal(times.length, 1);
    assert.equal(executions, 2);
    assert.equal(requests, 1);
    assert.equal(h.timers.size, 0);
  }
});

test('each API call gets a new token and sends the current V4 action', async () => {
  const h = harness();
  let executions = 0;
  const seen = [];
  captcha(h, 'current-key', true, async () => `fresh-${++executions}`);
  h.fetch(async (url, options) => {
    seen.push([options.headers.get('X-Recaptcha-Token'), options.headers.get('X-Recaptcha-Action')]);
    return response({ successful: true, data: [] });
  });
  await h.app.loadV4Times(courseA);
  await h.app.loadV4Times(courseA);
  assert.deepEqual(seen, [['fresh-1', 'bookingenginev4_booking_times'], ['fresh-2', 'bookingenginev4_booking_times']]);
});

test('HTTP and successful:false envelopes are rejected centrally with safe messages', async () => {
  for (const body of [{ successful: false, messageForUser: 'raw-secret-key' }, { status: { successful: false, messageForUser: 'raw-secret-key' } }]) {
    const h = harness();
    h.fetch(async () => response(body));
    await assert.rejects(h.app.api('TeeTimes/Search'), error => {
      assert.equal(error.code, 'API_REJECTED');
      assert.doesNotMatch(error.message, /raw-secret-key/);
      assert.match(error.diagnostic, /raw-secret-key/);
      return true;
    });
  }
  const h = harness();
  h.fetch(async () => response('<html>upstream stack trace</html>', 502));
  await assert.rejects(h.app.api('TeeTimes/Search'), error => error.code === 'API_REJECTED' && !error.message.includes('stack trace'));
  h.fetch(async () => response({ successful: false, messageForUser: 'reCAPTCHA evaluation failed' }));
  await assert.rejects(h.app.api('TeeTimes/Search'), error => error.code === 'CAPTCHA_REJECTED');
});

test('network requests time out after captcha and malformed responses never mean empty', async () => {
  const h = harness();
  captcha(h);
  let requestSignal;
  h.fetch((url, options) => new Promise((resolve, reject) => {
    requestSignal = options.signal;
    requestSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const pending = h.app.api('TeeTimes/Search', { recaptcha: true });
  const check = assert.rejects(pending, error => error.code === 'API_TIMEOUT');
  await flush();
  h.advance(15000);
  await check;
  assert.equal(requestSignal.aborted, true);
  h.fetch(async () => response('not json'));
  await assert.rejects(h.app.api('TeeTimes/Search'), error => error.code === 'API_RESPONSE');
  h.fetch(async () => response({ status: { successful: true } }));
  await assert.rejects(h.app.loadTimes(courseA), error => error.code === 'API_RESPONSE');
});

test('loading, verification error, and genuine empty results have distinct recovery UI', async () => {
  const h = harness();
  select(h);
  const hold = deferred();
  captcha(h, 'current-key', true, () => hold.promise);
  const pending = h.app.ensureSelectedTimes();
  assert.match(h.shadow.innerHTML, /Checking tee times…/);
  assert.doesNotMatch(h.shadow.innerHTML, /No tee times available/);
  hold.reject(new Error('Invalid site key raw-key stack'));
  await pending;
  const html = h.app.renderEmpty(courseA);
  assert.match(html, /Couldn’t check tee times/);
  assert.match(html, /data-action="retry"/);
  assert.match(html, /Use TenFore/);
  assert.match(html, /<details[^>]*><summary>Technical details<\/summary>/);
  assert.doesNotMatch(html.split('<details')[0], /raw-key|stack|No tee times/);
  assert.doesNotMatch(h.app.renderStatus(), /raw-key|stack|Invalid site key/);
  assert.equal(h.app.state.timesByCourse.has(h.app.requestKey(courseA)), false);
  captcha(h);
  h.fetch(async () => response({ data: [] }));
  await h.app.retrySelectedTimes();
  assert.equal(h.app.state.error, '');
  const empty = h.app.renderEmpty(courseA);
  assert.match(empty, /No tee times available/);
  assert.match(empty, /Needwood on 2026-10-20/);
  assert.match(empty, /Try another date/);
  assert.doesNotMatch(empty, /Couldn’t check|Invalid site key/);
});

test('failure envelopes never cache an empty success, and Retry reloads the current query', async () => {
  const h = harness();
  select(h);
  captcha(h);
  const seen = [];
  h.fetch(async url => { seen.push(url); return response({ status: { successful: false, messageForUser: 'upstream failure' } }); });
  await h.app.ensureSelectedTimes();
  assert.equal(seen.length, 2, 'tries the non-captcha fallback once');
  assert.equal(h.app.state.timesByCourse.size, 0);
  assert.match(h.shadow.innerHTML, /Couldn’t check tee times/);
  h.fetch(async () => response({ data: [] }));
  await h.app.retrySelectedTimes();
  assert.equal(h.app.state.timesByCourse.get(h.app.requestKey(courseA)).length, 0);
  assert.equal(h.app.state.errorsByCourse.size, 0);
});

test('late dates keep their captured request date, even when the fallback starts later', async () => {
  const h = harness();
  select(h);
  captcha(h);
  const search = deferred();
  const requests = [];
  h.fetch(async (url, options) => {
    requests.push([url, options.body]);
    if (url.includes('/TeeTimes/Search')) return search.promise;
    return response({ data: [] });
  });
  const pending = h.app.loadTimes(courseA);
  await flush();
  h.app.state.date = '2026-10-21';
  search.resolve(response({ data: [] }));
  await pending;
  assert.match(requests[0][0], /dateFrom=2026-10-20/);
  assert.equal(JSON.parse(requests[1][1]).dateFrom, '2026-10-20');
  assert.equal(h.app.state.debugByCourse.get(h.app.requestKey(courseA, '2026-10-20')).date, '2026-10-20');
});

test('late query errors cannot overwrite the current success or leak into cached results', async () => {
  const h = harness();
  select(h);
  captcha(h);
  const oldSearch = deferred();
  let fetches = 0;
  h.fetch(async (url, options) => {
    fetches++;
    if (url.includes('dateFrom=2026-10-20')) return oldSearch.promise;
    if (url.includes('/BookingEngineV4/')) return response({ successful: false });
    return response({ data: [rawSlot('2026-10-21')] });
  });
  const old = h.app.ensureSelectedTimes();
  await flush();
  await h.app.setSelectedDate('2026-10-21');
  const currentKey = h.app.requestKey(courseA);
  assert.equal(h.app.state.timesByCourse.get(currentKey).length, 1);
  oldSearch.resolve(response({ successful: false, messageForUser: 'Old request failed' }));
  await old;
  assert.equal(h.app.state.loading, false);
  assert.equal(h.app.state.error, '');
  assert.match(h.shadow.innerHTML, /mcg-table-row/);
  const before = fetches;
  h.app.state.errorsByCourse.set(currentKey, new Error('stale cache error'));
  await h.app.ensureSelectedTimes();
  assert.equal(fetches, before, 'cached success does not refetch');
  assert.equal(h.app.state.error, '');
});

test('late successful course request cannot end loading or replace another course result', async () => {
  const h = harness();
  select(h);
  captcha(h);
  const oldSearch = deferred(), newSearch = deferred();
  h.fetch(async url => url.includes('golfCourseIds=16509') ? oldSearch.promise : newSearch.promise);
  const old = h.app.ensureSelectedTimes();
  await flush();
  h.app.state.selectedKey = h.app.courseKey(courseB);
  const current = h.app.ensureSelectedTimes();
  oldSearch.resolve(response({ data: [rawSlot('2026-10-20')] }));
  await old;
  assert.equal(h.app.state.loading, true);
  assert.match(h.shadow.innerHTML, /Loading availability for Falls Road/);
  assert.doesNotMatch(h.shadow.innerHTML, /mcg-table-row best/);
  newSearch.resolve(response({ data: [rawSlot('2026-10-20')] }));
  await current;
  assert.equal(h.app.state.loading, false);
  assert.equal(h.app.state.timesByCourse.size, 2);
});

test('successful empty queries are cached across date changes and duplicate requests deduplicate', async () => {
  const h = harness();
  select(h);
  captcha(h);
  let fetches = 0;
  h.fetch(async () => { fetches++; return response({ data: [] }); });
  await Promise.all([h.app.ensureSelectedTimes(), h.app.ensureSelectedTimes()]);
  assert.equal(fetches, 2, 'one search plus one fallback despite two callers');
  await h.app.setSelectedDate('2026-10-21');
  assert.equal(fetches, 4);
  await h.app.setSelectedDate('2026-10-20');
  assert.equal(fetches, 4);
  assert.match(h.shadow.innerHTML, /No tee times available/);
});

test('course lookup failure stays actionable and Retry reloads real courses', async () => {
  const h = harness();
  let calls = 0;
  h.fetch(async () => { calls++; throw new TypeError('Offline'); });
  await h.app.boot();
  assert.equal(calls, 1, 'does not disguise a course error with a demo tee-time lookup');
  assert.equal(h.app.state.courses.length, 0);
  assert.match(h.shadow.innerHTML, /Couldn’t check tee times/);
  assert.match(h.shadow.innerHTML, /data-action="retry"/);
  captcha(h);
  h.fetch(async url => response(url.includes('/GolfCourse/') ? {
    companyCourses: [{ golfCourseID: courseA.id, courseName: courseA.fullName, vanityName: courseA.vanityName, maxBookingDaysOut: 14 }]
  } : { data: [] }));
  await h.app.retrySelectedTimes();
  assert.equal(h.app.state.coursesError, null);
  assert.equal(h.app.state.courses.length, 1);
  assert.match(h.shadow.innerHTML, /No tee times available/);
});

test('weather stays nonblocking and completion after cleanup cannot revive the overlay', async () => {
  const h = harness();
  select(h);
  captcha(h);
  const weather = deferred();
  h.app.setWeatherLoader(() => weather.promise);
  h.fetch(async () => response({ data: [rawSlot('2026-10-20')] }));
  await h.app.ensureSelectedTimes();
  assert.equal(h.app.state.loading, false, 'tee times finish before weather');
  assert.match(h.shadow.innerHTML, /mcg-table-row/);
  h.window.__mcgTeePressureCleanup();
  assert.equal(h.shadow.innerHTML, '');
  weather.resolve({ hours: {}, days: {} });
  await flush();
  assert.equal(h.shadow.innerHTML, '');
  assert.equal(h.app.state.weatherByCourseDate.size, 0);
});
