import * as lib from './lib.mjs';

const { escapeHTML: esc } = lib;
const REFRESH_AFTER = 2 * 60_000; // matches the server's two-minute freshness for today and tomorrow
const WEATHER_REFRESH_AFTER = 30 * 60_000;
const TIMEOUT = 15_000;
const MIN_PX_PER_MINUTE = 1.15;
const params = new URLSearchParams(location.search);
const forcedLayout = ['mobile', 'desktop'].includes(params.get('layout')) ? params.get('layout') : null;
const wide = matchMedia('(min-width: 900px)');
const root = document.getElementById('app');

// ---- Preferences ----
function pref(key, fallback) {
  try { const value = localStorage.getItem(`mcgtee.${key}`); return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(`mcgtee.${key}`, JSON.stringify(value)); } catch { /* Private mode: preferences last for this visit. */ }
}

const days = lib.nextDays(8);
const state = {
  units: lib.deriveUnits(lib.FALLBACK_COURSES),
  date: days.includes(params.get('date')) ? params.get('date') : lib.initialDate(),
  players: [1, 2, 3, 4].includes(pref('players', 2)) ? pref('players', 2) : 2,
  emptyOnly: pref('emptyOnly', false) === true,
  holes: ['all', '18', '9'].includes(pref('holes', 'all')) ? pref('holes', 'all') : 'all',
  dayData: new Map(),
  weather: null,
  weatherLoadedAt: 0
};

// ---- Data ----
async function api(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' }, signal: controller.signal, credentials: 'same-origin' });
    let body = null;
    try { body = await response.json(); } catch { /* handled below */ }
    if (!response.ok || !body) throw new Error(body?.messageForUser || 'Unexpected response. Please retry.');
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Took too long to respond. Please retry.');
    if (error instanceof TypeError) throw new Error('Network error. Check your connection and retry.');
    throw error;
  } finally { clearTimeout(timer); }
}

function dayEntry(date) {
  if (!state.dayData.has(date)) state.dayData.set(date, { units: new Map(), loadedAt: 0, pending: false });
  return state.dayData.get(date);
}

async function loadDay(date) {
  const entry = dayEntry(date);
  if (entry.pending) return;
  entry.pending = true;
  for (const unit of state.units) if (!entry.units.get(unit.key)?.teeTimes) entry.units.set(unit.key, { status: 'loading' });
  render();
  try {
    const body = await api(`/api/day?date=${encodeURIComponent(date)}`);
    for (const u of body.units || []) {
      const key = lib.unitKey(u.courseId, u.subCourseId);
      const previous = entry.units.get(key);
      entry.units.set(key, u.ok
        ? { status: 'ok', teeTimes: u.teeTimes, fetchedAt: Date.parse(u.meta?.fetchedAt) || Date.now(), stale: !!u.meta?.stale }
        // Keep showing the last good rows if this refresh failed for one unit.
        : previous?.teeTimes ? { ...previous, refreshError: u.messageForUser } : { status: 'error', message: u.messageForUser || 'Couldn’t load.' });
    }
    entry.loadedAt = Date.now();
  } catch (error) {
    for (const unit of state.units) {
      const current = entry.units.get(unit.key);
      if (!current?.teeTimes) entry.units.set(unit.key, { status: 'error', message: error.message });
    }
    entry.error = error.message;
  } finally {
    entry.pending = false;
    render();
  }
}

async function retryUnit(key) {
  const unit = state.units.find(u => u.key === key);
  if (!unit) return;
  const date = state.date;
  const entry = dayEntry(date);
  const hadFocus = document.activeElement?.dataset?.fkey === `retry-${key}`;
  entry.units.set(key, { status: 'loading' });
  render();
  try {
    const body = await api(`/api/availability?courseId=${unit.courseId}&subCourseId=${unit.subCourseId}&date=${encodeURIComponent(date)}`);
    entry.units.set(key, { status: 'ok', teeTimes: body.teeTimes, fetchedAt: Date.parse(body.meta?.fetchedAt) || Date.now(), stale: !!body.meta?.stale });
  } catch (error) {
    entry.units.set(key, { status: 'error', message: error.message });
  }
  render();
  // The Retry button is replaced by the row's times; keep keyboard focus in that row.
  if (hadFocus && !root.contains(document.activeElement)) {
    root.querySelector(`[data-unit="${key}"] a, [data-unit="${key}"] button`)?.focus({ preventScroll: true });
  }
}

async function loadCourses() {
  try {
    const body = await api('/api/courses');
    const units = lib.deriveUnits(body.companyCourses);
    if (units.length) { state.units = units; render(); }
  } catch { /* The built-in course list keeps the page usable. */ }
}

async function loadWeather() {
  try {
    state.weather = await api('/api/weather');
    state.weatherLoadedAt = Date.now();
    render();
  } catch { state.weatherLoadedAt = Date.now() - WEATHER_REFRESH_AFTER + 120_000; /* Retry in two minutes; weather is optional. */ }
}

function refreshIfOld() {
  const entry = state.dayData.get(state.date);
  if (!entry || (!entry.pending && Date.now() - entry.loadedAt > REFRESH_AFTER)) loadDay(state.date);
  if (Date.now() - state.weatherLoadedAt > WEATHER_REFRESH_AFTER) loadWeather();
}

// ---- Derived view data ----
function isToday(date) { return date === lib.todayET(); }
function nowMinutes() { return lib.easternParts().minutes; }

function dayContext(date) {
  const wx = state.weather?.days?.[date] || null;
  return {
    wx,
    hours: state.weather?.hours?.[date] || null,
    sunrise: lib.clockMinutes(wx?.sunrise),
    sunset: lib.clockMinutes(wx?.sunset),
    now: isToday(date) ? nowMinutes() : null
  };
}

function unitRows(date) {
  const entry = state.dayData.get(date);
  const now = isToday(date) ? nowMinutes() : null;
  return lib.filterUnits(state.units, state.holes).map(unit => {
    const data = entry?.units.get(unit.key) || { status: entry ? 'loading' : 'idle' };
    const times = data.teeTimes ? lib.prepareTimes(data.teeTimes, now) : [];
    const fitCount = times.filter(t => lib.fits(t, state.players, state.emptyOnly)).length;
    return { unit, data, times, fitCount, price: lib.priceRange(times), interval: lib.typicalInterval(times.map(t => t.minute)) };
  });
}

function dayFitCount(date) {
  const entry = state.dayData.get(date);
  if (!entry || ![...entry.units.values()].some(u => u.teeTimes)) return null;
  return unitRows(date).reduce((sum, row) => sum + row.fitCount, 0);
}

function metaLine(row) {
  const bits = [String(row.unit.holes)];
  if (row.price) bits.push(lib.formatPriceRange(row.price));
  if (row.data.teeTimes) bits.push(`${row.fitCount} open`);
  return bits.join(' · ');
}

function pips(time, cls = 'pips') {
  const total = Math.max(1, time.maxSlots);
  const taken = lib.booked(time);
  const cols = total <= 4 ? 2 : Math.ceil(Math.sqrt(total));
  let html = '';
  for (let i = 0; i < total; i++) html += `<i class="${i < taken ? 'b' : 'o'}"></i>`;
  return `<span class="${cls}" style="--cols:${cols}" aria-hidden="true">${html}</span>`;
}

function timeView(row, time, ctx) {
  const state_ = lib.fitState(time, state.players, state.emptyOnly);
  const weather = lib.hourWeather(ctx.hours, time.minute);
  const late = lib.finishesAfterSunset(time.minute, row.unit.holes, ctx.sunset);
  const label = lib.describeTime({ time, unit: row.unit, players: state.players, weather, sunset: ctx.sunset });
  const href = state_ === 'none' ? '' : lib.bookingUrl(row.unit, time, state.players);
  // TenFore preselects every open spot, so remind people to pick their party size there.
  const tip = href ? `${label} · Book on TenFore, then set ${state.players} player${state.players === 1 ? '' : 's'}` : label;
  return { fit: state_, late, label, tip, href, fkey: `t-${row.unit.key}-${time.teeTimeID}` };
}

// ---- Rendering ----
function renderHeader() {
  const dayButtons = days.map(date => {
    const label = lib.dayLabel(date);
    const wx = state.weather?.days?.[date];
    const count = dayFitCount(date);
    const selected = date === state.date;
    const aria = [label.long, isToday(date) ? 'today' : '', count === null ? '' : `${count} open tee times`, wx ? `high ${wx.high}°, low ${wx.low}°` : '', wx?.rainMax >= 20 ? `${wx.rainMax}% chance of rain` : ''].filter(Boolean).join(', ');
    return `<button type="button" class="day${selected ? ' is-on' : ''}${isToday(date) ? ' is-today' : ''}" data-date="${date}" data-fkey="day-${date}" aria-pressed="${selected}" aria-label="${esc(aria)}">
      <span class="day-top"><span class="day-name">${esc(label.weekday)} ${label.day}</span><span class="day-count">${count === null ? '' : count}</span></span>
      <span class="day-wx">${wx && wx.high !== null ? `${wx.high}°/${wx.low}°` : '&nbsp;'}${wx?.rainMax >= 20 ? ` <span class="rain">${wx.rainMax}%</span>` : ''}</span>
    </button>`;
  }).join('');
  const seg = (name, options, current, label) => `<div class="seg" role="group" aria-label="${label}"><span class="seg-label" aria-hidden="true">${label}</span>${options.map(([value, text]) =>
    `<button type="button" data-${name}="${value}" data-fkey="${name}-${value}" aria-pressed="${String(value) === String(current)}">${text}</button>`).join('')}</div>`;
  return `<header class="bar">
    <div class="brand"><span class="wordmark">MCG Tee</span><span class="tagline">Montgomery County tee times</span></div>
    <nav class="days" aria-label="Choose a day">${dayButtons}</nav>
    <div class="controls">
      ${seg('players', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], state.players, 'Players')}
      ${seg('holes', [['all', 'All'], ['18', '18'], ['9', '9']], state.holes, 'Holes')}
      <button type="button" class="switch" data-action="empty" data-fkey="empty" aria-pressed="${state.emptyOnly}"><span class="switch-track" aria-hidden="true"></span>Empty tee times only</button>
    </div>
  </header>`;
}

function freshnessText() {
  const entry = state.dayData.get(state.date);
  if (!entry || (entry.pending && !entry.loadedAt)) return 'Checking tee times…';
  if (entry.pending) return 'Updating…';
  const loaded = [...entry.units.values()].filter(u => u.teeTimes);
  if (!loaded.length) return 'Couldn’t check';
  const oldest = Math.min(...loaded.map(u => u.fetchedAt));
  const stale = loaded.some(u => u.stale || u.refreshError);
  const failed = [...entry.units.values()].filter(u => u.status === 'error').length;
  return `Updated ${lib.formatAgo(Date.now() - oldest)}${stale ? ' · some cached' : ''}${failed ? ` · ${failed} couldn’t load` : ''}`;
}

function renderBand(ctx) {
  const label = lib.dayLabel(state.date);
  const { wx } = ctx;
  const bits = [`<strong>${esc(label.long)}</strong>`];
  if (Number.isFinite(ctx.sunrise)) bits.push(`<span class="sun" title="Sunrise">↑ ${lib.formatTime(ctx.sunrise)}</span>`);
  if (Number.isFinite(ctx.sunset)) bits.push(`<span class="sun" title="Sunset">↓ ${lib.formatTime(ctx.sunset)}</span>`);
  if (Number.isFinite(ctx.sunrise) && Number.isFinite(ctx.sunset)) bits.push(`<span>${lib.formatDuration(ctx.sunset - ctx.sunrise)} daylight</span>`);
  if (wx && wx.high !== null) bits.push(`<span>${wx.high}° / ${wx.low}°</span>`);
  if (wx && wx.rainMax !== null) bits.push(`<span class="${wx.rainMax >= 20 ? 'rain' : ''}">${wx.rainMax}% rain</span>`);
  if (wx && wx.windMax >= 15) bits.push(`<span>wind ${wx.windMax} mph</span>`);
  const legend = `<span class="legend" aria-hidden="true">
    <span class="lg"><span class="lg-block fit">${pips({ maxSlots: 4, availableSlots: 4 }, 'pips')}</span>empty</span>
    <span class="lg"><span class="lg-block fit busy">${pips({ maxSlots: 4, availableSlots: 2 }, 'pips')}</span>● booked ○ open</span>
    <span class="lg"><span class="lg-block none">${pips({ maxSlots: 4, availableSlots: 1 }, 'pips')}</span>too few spots</span>
    <span class="lg"><span class="lg-block fit late">${pips({ maxSlots: 4, availableSlots: 4 }, 'pips')}</span>ends after sunset</span>
  </span>`;
  const fresh = `<span class="fresh"><span data-fresh aria-live="polite">${esc(freshnessText())}</span><button type="button" class="link-button" data-action="refresh" data-fkey="refresh">Refresh</button></span>`;
  return `<section class="band" aria-label="Day conditions"><span class="band-facts">${bits.join('<span class="dot" aria-hidden="true">·</span>')}</span>${legend}${fresh}</section>`;
}

function rowState(row) {
  if (row.data.status === 'loading' || row.data.status === 'idle') return `<span class="shimmer" aria-label="Loading"></span>`;
  if (row.data.status === 'error') return `<span class="row-note err">Couldn’t load · <button type="button" class="link-button" data-retry="${row.unit.key}" data-fkey="retry-${row.unit.key}">Retry</button><span class="sr-only"> ${esc(row.unit.name)}</span></span>`;
  if (!row.times.length) return `<span class="row-note">${isToday(state.date) && row.data.teeTimes?.length ? 'No tee times left today' : 'No tee times'}</span>`;
  return '';
}

function renderTimeline(rows, ctx) {
  const all = rows.flatMap(r => r.times.map(t => t.minute));
  const interval = Math.max(10, ...rows.filter(r => r.times.length).map(r => r.interval));
  const range = lib.timelineRange({ minutes: all, sunrise: ctx.sunrise, sunset: ctx.sunset, now: ctx.now, interval });
  const x = m => `${lib.xPercent(m, range).toFixed(3)}%`;
  const inRange = m => Number.isFinite(m) && m > range.start && m < range.end;
  const markers = [];
  if (inRange(ctx.sunrise)) markers.push({ m: ctx.sunrise, cls: 'sunrise', text: `↑ ${lib.formatClock(ctx.sunrise)}`, aria: `Sunrise ${lib.formatTime(ctx.sunrise)}` });
  if (inRange(ctx.sunset)) markers.push({ m: ctx.sunset, cls: 'sunset', text: `↓ ${lib.formatClock(ctx.sunset)}`, aria: `Sunset ${lib.formatTime(ctx.sunset)}` });
  if (Number.isFinite(ctx.now) && ctx.now >= range.start && ctx.now <= range.end) markers.push({ m: ctx.now, cls: 'now', text: 'now', aria: `Now ${lib.formatTime(ctx.now)}` });
  const ticks = lib.hourTicks(range);
  const hourLabels = ticks.slice(0, -1)
    .filter(m => !markers.some(k => m > k.m - 22 && m < k.m + 34))
    .map(m => `<span class="tick" style="left:${x(m)}">${lib.formatHour(m)}</span>`).join('');
  const markerLabels = markers.map(k => `<span class="mark ${k.cls}" style="left:${x(k.m)}" title="${k.aria}">${k.text}</span>`).join('');

  const shade = [];
  if (Number.isFinite(ctx.sunrise) && ctx.sunrise > range.start) shade.push(`<span class="dusk" style="left:0;width:${x(Math.min(ctx.sunrise, range.end))}"></span>`);
  if (Number.isFinite(ctx.sunset) && ctx.sunset < range.end) shade.push(`<span class="dusk" style="left:${x(Math.max(ctx.sunset, range.start))};right:0"></span>`);
  const overlay = `<div class="tl-overlay" aria-hidden="true">${shade.join('')}
    ${ticks.map(m => `<span class="grid" style="left:${x(m)}"></span>`).join('')}
    ${markers.map(k => `<span class="vline ${k.cls}" style="left:${x(k.m)}"></span>`).join('')}</div>`;

  let weatherRow = '';
  if (ctx.hours?.length) {
    const cells = [];
    for (let m = range.start; m < range.end; m += 60) {
      const h = lib.hourWeather(ctx.hours, m);
      if (!h || h.temp === null) continue;
      const tint = lib.temperatureTint(h.temp);
      cells.push(`<span class="wx ${tint.tone}" style="left:${x(m)};width:${(60 / range.span * 100).toFixed(3)}%;--amt:${tint.amount.toFixed(2)}" title="${lib.formatHour(m)}: ${h.temp}°F${h.rain !== null ? `, ${h.rain}% rain` : ''}${h.wind !== null ? `, wind ${h.wind} mph` : ''}">${h.temp}°${h.rain >= 20 ? `<span class="rain">${h.rain}%</span>` : ''}</span>`);
    }
    weatherRow = `<div class="tl-line tl-wx"><div class="tl-label wx-key">Temp · rain</div><div class="tl-track">${cells.join('')}</div></div>`;
  }

  const width = `calc(${(interval / range.span * 100).toFixed(3)}% - 2px)`;
  const body = rows.map(row => {
    const rowWidth = `calc(${(row.interval / range.span * 100).toFixed(3)}% - 2px)`;
    const blocks = row.times.map(time => {
      const v = timeView(row, time, ctx);
      const cls = `tt ${v.fit}${v.fit === 'fit' && time.availableSlots < time.maxSlots ? ' busy' : ''}${v.late ? ' late' : ''}`;
      const style = `left:${x(time.minute)};width:${rowWidth}`;
      return v.href
        ? `<a class="${cls}" style="${style}" href="${esc(v.href)}" target="_blank" rel="noopener" data-tip="${esc(v.tip)}" aria-label="${esc(v.tip)}" data-fkey="${esc(v.fkey)}">${pips(time)}</a>`
        : `<span class="${cls}" style="${style}" data-tip="${esc(v.label)}" aria-label="${esc(v.label)}" role="img">${pips(time)}</span>`;
    }).join('');
    return `<div class="tl-line tl-row" data-unit="${row.unit.key}">
      <div class="tl-label"><span class="u-name">${esc(row.unit.name)}</span><span class="u-meta">${esc(metaLine(row))}</span></div>
      <div class="tl-track">${blocks}${rowState(row)}</div>
    </div>`;
  }).join('');

  return `<section class="timeline" aria-label="Tee times by course" style="--min-track:${Math.round(range.span * MIN_PX_PER_MINUTE)}px;--block:${width}">
    <div class="tl-scroll"><div class="tl-inner">
      ${overlay}
      <div class="tl-line tl-axis"><div class="tl-label axis-key">${esc(rows.length)} ${rows.length === 1 ? 'course' : 'courses'}</div><div class="tl-track">${hourLabels}${markerLabels}</div></div>
      ${weatherRow}
      ${body}
    </div></div>
  </section>`;
}

function renderMobile(rows, ctx) {
  const shown = [], collapsed = [];
  for (const row of rows) (row.data.status === 'ok' && !row.fitCount ? collapsed : shown).push(row);
  const sections = shown.map(row => {
    let chips = '', lastHour = null, sunriseShown = false, sunsetShown = false;
    for (const time of row.times) {
      if (!sunriseShown && Number.isFinite(ctx.sunrise) && time.minute >= ctx.sunrise && row.times[0].minute < ctx.sunrise) { chips += `<span class="hr sun">↑ sunrise ${lib.formatClock(ctx.sunrise)}</span>`; sunriseShown = true; }
      if (!sunsetShown && Number.isFinite(ctx.sunset) && time.minute >= ctx.sunset) { chips += `<span class="hr sun">↓ sunset ${lib.formatClock(ctx.sunset)}</span>`; sunsetShown = true; }
      const hour = Math.floor(time.minute / 60);
      if (hour !== lastHour) {
        const h = lib.hourWeather(ctx.hours, time.minute);
        chips += `<span class="hr">${lib.formatHour(hour * 60)}${h && h.temp !== null ? ` ${h.temp}°` : ''}${h?.rain >= 20 ? ` <span class="rain">${h.rain}%</span>` : ''}</span>`;
        lastHour = hour;
      }
      const v = timeView(row, time, ctx);
      const cls = `chip ${v.fit}${v.fit === 'fit' && time.availableSlots < time.maxSlots ? ' busy' : ''}${v.late ? ' late' : ''}`;
      const inner = `<span class="chip-time">${lib.formatClock(time.minute)}</span>${pips(time)}`;
      chips += v.href
        ? `<a class="${cls}" href="${esc(v.href)}" target="_blank" rel="noopener" aria-label="${esc(v.tip)}" data-fkey="${esc(v.fkey)}">${inner}</a>`
        : `<span class="${cls}" aria-label="${esc(v.label)}" role="img">${inner}</span>`;
    }
    return `<section class="m-unit" data-unit="${row.unit.key}">
      <h2><span class="u-name">${esc(row.unit.name)}</span><span class="u-meta">${esc(metaLine(row))}</span></h2>
      <div class="chips">${chips || rowState(row)}</div>
    </section>`;
  }).join('');
  const none = collapsed.length
    ? `<p class="m-none">No ${state.emptyOnly ? 'empty ' : ''}times for ${state.players} ${state.players === 1 ? 'player' : 'players'} at: ${collapsed.map(r => esc(r.unit.name)).join(', ')}</p>`
    : '';
  return `<section class="mobile-list" aria-label="Tee times by course">${sections}${none}</section>`;
}

function isWide() {
  return forcedLayout ? forcedLayout === 'desktop' : wide.matches;
}

function render() {
  const focusKey = document.activeElement?.dataset?.fkey;
  const scrollers = ['.tl-scroll', '.days'].map(sel => [sel, document.querySelector(sel)?.scrollLeft || 0]);
  hideTip();
  const ctx = dayContext(state.date);
  const rows = unitRows(state.date);
  const desktop = isWide();
  root.className = desktop ? 'layout-desktop' : 'layout-mobile';
  root.innerHTML = `${renderHeader()}${renderBand(ctx)}<main>${desktop ? renderTimeline(rows, ctx) : renderMobile(rows, ctx)}</main>
    <footer class="foot">Independent finder. Tap a tee time to book on <a href="https://fox.tenfore.golf/mcggolf" target="_blank" rel="noopener">MCG Golf / TenFore</a>. TenFore preselects every open spot, so set your player count there. Prices are public walking rates; member rates, carts and tax differ — confirm on TenFore. Final availability is TenFore&rsquo;s.</footer>`;
  for (const [sel, left] of scrollers) { const el = document.querySelector(sel); if (el) el.scrollLeft = left; }
  if (!scrollers[1][1]) document.querySelector('.day.is-on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  if (focusKey) root.querySelector(`[data-fkey="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

// ---- Tooltip ----
const tip = document.createElement('div');
tip.className = 'tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.append(tip);

function showTip(target) {
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const rect = target.getBoundingClientRect();
  const width = tip.offsetWidth, height = tip.offsetHeight;
  const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2));
  const above = rect.top - height - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${above >= 8 ? above : rect.bottom + 8}px`;
}
function hideTip() { tip.hidden = true; }

// ---- Events ----
function setDate(date) {
  if (date === state.date) return;
  state.date = date;
  const url = new URL(location.href);
  url.searchParams.set('date', date);
  history.replaceState(null, '', url);
  render();
  refreshIfOld();
}

root.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.date) setDate(target.dataset.date);
  else if (target.dataset.players) { state.players = Number(target.dataset.players); savePref('players', state.players); render(); }
  else if (target.dataset.holes) { state.holes = target.dataset.holes; savePref('holes', state.holes); render(); }
  else if (target.dataset.action === 'empty') { state.emptyOnly = !state.emptyOnly; savePref('emptyOnly', state.emptyOnly); render(); }
  else if (target.dataset.action === 'refresh') { loadDay(state.date); if (!state.weather) loadWeather(); }
  else if (target.dataset.retry) retryUnit(target.dataset.retry);
});

root.addEventListener('pointerover', event => { const t = event.target.closest('[data-tip]'); if (t) showTip(t); });
root.addEventListener('pointerout', event => { if (event.target.closest('[data-tip]') && !event.relatedTarget?.closest?.('[data-tip]')) hideTip(); });
root.addEventListener('focusin', event => { const t = event.target.closest('[data-tip]'); t ? showTip(t) : hideTip(); });
root.addEventListener('focusout', hideTip);
addEventListener('scroll', hideTip, { capture: true, passive: true });
addEventListener('keydown', event => { if (event.key === 'Escape') hideTip(); });

if (!forcedLayout) wide.addEventListener('change', render);
addEventListener('focus', refreshIfOld);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshIfOld(); });

let lastMinute = nowMinutes();
setInterval(() => {
  const minute = nowMinutes();
  if (minute !== lastMinute && isToday(state.date)) { lastMinute = minute; render(); return; }
  lastMinute = minute;
  const fresh = root.querySelector('[data-fresh]');
  if (fresh) fresh.textContent = freshnessText();
}, 15_000);

render();
loadCourses();
loadDay(state.date);
loadWeather();
