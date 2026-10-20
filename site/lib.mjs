// Pure, DOM-free helpers for the hosted MCG Tee page. All clock math is Eastern wall time.
export const ZONE = 'America/New_York';
export const BOOKING_HOST = 'https://fox.tenfore.golf';
export const ROUND_MINUTES = { 18: 255, 9: 125 };
const DAY_MS = 86400_000;

// Used only when /api/courses is unavailable, so the day view can still load and link out.
export const FALLBACK_COURSES = [
  [16503, 'Falls Road Golf Course', 'fallsroad', 18], [16504, 'Northwest Golf Course', 'northwest', 18, [1032, 'Inside 9']],
  [16506, 'Hampshire Greens Golf Course', 'hampshiregreens', 18], [16507, 'Laytonsville Golf Course', 'laytonsville', 18],
  [16508, 'Little Bennett Golf Course', 'littlebennett', 18], [16509, 'Needwood Golf Course', 'needwood', 18, [1031, 'Executive 9']],
  [16510, 'Golf at The Crossvines', 'crossvines', 18], [16511, 'Rattlewood Golf Course', 'rattlewood', 18],
  [16512, 'Sligo Creek Golf Course', 'SligoCreek', 9]
].map(([golfCourseID, courseName, vanityName, defaultNumberOfHoles, sub]) => ({
  golfCourseID, courseName, vanityName, defaultNumberOfHoles, maxBookingPlayers: 4,
  subCourses: sub ? [{ subCourseID: sub[0], name: sub[1] }] : []
}));

export function shortName(courseName) {
  return String(courseName || 'Course').replace(/\s+Golf Course$/i, '').replace(/^Golf at (the\s+)?/i, '').trim();
}

export function unitKey(courseId, subCourseId) {
  return `${courseId}:${subCourseId || 0}`;
}

/** One entry per bookable unit: 18-hole courses alphabetically, then 9-hole units alphabetically. */
export function deriveUnits(companyCourses) {
  const units = [];
  for (const course of Array.isArray(companyCourses) ? companyCourses : []) {
    const courseId = Number(course?.golfCourseID);
    if (!courseId || !course.vanityName) continue;
    const base = shortName(course.courseName);
    const shared = { courseId, vanityName: course.vanityName, fullName: course.courseName, maxPlayers: Number(course.maxBookingPlayers) || 4 };
    units.push({ ...shared, key: unitKey(courseId, 0), subCourseId: 0, name: base, holes: Number(course.defaultNumberOfHoles) <= 9 ? 9 : 18 });
    for (const sub of course.subCourses || []) {
      const subCourseId = Number(sub.subCourseID);
      if (!subCourseId) continue;
      const subName = String(sub.name || 'Subcourse').replace(/^Executive\b/i, 'Exec');
      units.push({ ...shared, key: unitKey(courseId, subCourseId), subCourseId, name: `${base} ${subName}`, holes: 9 });
    }
  }
  return units.sort((a, b) => (b.holes - a.holes) || a.name.localeCompare(b.name));
}

export function filterUnits(units, holes) {
  return holes === '18' || holes === '9' ? units.filter(u => u.holes === Number(holes)) : units;
}

// ---- Eastern dates ----
const partsFormatter = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function easternParts(now = Date.now()) {
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export function todayET(now = Date.now()) {
  return easternParts(now).date;
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** After 5pm Eastern, open on tomorrow. */
export function initialDate(now = Date.now()) {
  const { date, minutes } = easternParts(now);
  return minutes >= 17 * 60 ? addDays(date, 1) : date;
}

export function nextDays(count = 8, now = Date.now()) {
  const today = todayET(now);
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

export function dayLabel(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    day: d.getUTCDate(),
    long: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
  };
}

// ---- Times ----
/** Minutes after midnight from a TenFore timestamp's own wall-clock (they are all Eastern). */
export function minutesOf(dateScheduled) {
  const match = String(dateScheduled || '').match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "HH:MM" → minutes. */
export function clockMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Most common gap between consecutive tee times (TenFore omits full times, so the mode is robust). */
export function typicalInterval(minutes) {
  const sorted = [...minutes].filter(Number.isFinite).sort((a, b) => a - b);
  const counts = new Map();
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap >= 5 && gap <= 20) counts.set(gap, (counts.get(gap) || 0) + 1);
  }
  let best = 10, bestCount = 0;
  for (const [gap, count] of counts) if (count > bestCount || (count === bestCount && gap < best)) { best = gap; bestCount = count; }
  return best;
}

/**
 * Visible span in minutes, floored/ceiled to whole hours, covering tee times and sunrise/sunset.
 * When `now` is given (today), the past is dropped: the span starts at the current hour and a past sunrise is ignored.
 */
export function timelineRange({ minutes = [], sunrise = null, sunset = null, now = null, interval = 10 } = {}) {
  const times = minutes.filter(Number.isFinite);
  const low = [...times];
  const high = times.map(m => m + interval);
  if (Number.isFinite(sunrise) && !(Number.isFinite(now) && sunrise <= now)) low.push(sunrise);
  if (Number.isFinite(now)) { low.push(now); high.push(now); }
  if (Number.isFinite(sunset) && !(Number.isFinite(now) && sunset <= now)) high.push(sunset);
  if (!times.length && !Number.isFinite(sunrise)) { low.push(Number.isFinite(now) ? now : 6 * 60); }
  if (!times.length && !Number.isFinite(sunset)) high.push(Math.max(20 * 60, ...low));
  const start = Math.max(0, Math.floor(Math.min(...low) / 60) * 60);
  let end = Math.min(1440, Math.ceil(Math.max(...high) / 60) * 60);
  if (end <= start) end = Math.min(1440, start + 60);
  return { start, end, span: end - start };
}

export function xPercent(minute, range) {
  return ((minute - range.start) / range.span) * 100;
}

export function hourTicks(range) {
  const ticks = [];
  for (let m = range.start; m <= range.end; m += 60) ticks.push(m);
  return ticks;
}

// ---- Availability ----
export function booked(time) {
  return Math.max(0, time.maxSlots - time.availableSlots);
}

export function fits(time, players, emptyOnly = false) {
  return time.availableSlots >= players && (!emptyOnly || booked(time) === 0);
}

/** 'fit' bookable and highlighted · 'muted' bookable but has bookings while "empty only" is on · 'none' too few spots. */
export function fitState(time, players, emptyOnly = false) {
  if (time.availableSlots < players) return 'none';
  return emptyOnly && booked(time) > 0 ? 'muted' : 'fit';
}

export function finishMinutes(minute, holes) {
  return minute + (holes === 9 ? ROUND_MINUTES[9] : ROUND_MINUTES[18]);
}

export function finishesAfterSunset(minute, holes, sunset) {
  return Number.isFinite(sunset) && finishMinutes(minute, holes) > sunset;
}

// Courses whose public rate includes a cart.
export const CART_INCLUDED = new Set([16506, 16508]);

/** The tee time's price: the Worker's `rate` (feed price or public rate card), else the raw feed price. */
export function priceOf(time) {
  const value = time.rate ?? time.priceBeforeTax;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function priceRange(times) {
  const prices = times.map(priceOf).filter(p => p !== null);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function formatPrice(value) {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function formatPriceRange(range) {
  if (!range) return '';
  return range.min === range.max ? formatPrice(range.min) : `${formatPrice(range.min)}–${formatPrice(range.max)}`;
}

// TenFore's /:vanity/tee-time/:id page crashes unless the course is already loaded in that tab,
// which is never true for a new tab opened from here. /gctt/:courseId/:id loads the course itself.
// It currently ignores players/holes (players defaults to every open spot); they are kept in case
// TenFore starts honoring them.
export function bookingUrl(unit, time, players) {
  const url = new URL(`/gctt/${encodeURIComponent(unit.courseId)}/${encodeURIComponent(time.teeTimeID)}`, BOOKING_HOST);
  url.searchParams.set('players', String(players));
  url.searchParams.set('holes', String(unit.holes === 9 ? 9 : 18));
  return url.toString();
}

/** Prepared, sorted rows for one unit on one day. `nowMinutes` hides times already past. */
export function prepareTimes(teeTimes, nowMinutes = null) {
  return (teeTimes || [])
    .map(t => ({ ...t, minute: minutesOf(t.dateScheduled) }))
    .filter(t => Number.isFinite(t.minute) && !(Number.isFinite(nowMinutes) && t.minute < nowMinutes))
    .sort((a, b) => a.minute - b.minute);
}

// ---- Weather ----
export function hourWeather(hours, minute) {
  if (!Array.isArray(hours)) return null;
  const hour = Math.floor(minute / 60);
  return hours.find(h => h.hour === hour) || null;
}

/** Temperature tint: {tone:'cool'|'warm'|'', amount:0..1}. Neutral around 60°F. */
export function temperatureTint(temp) {
  if (typeof temp !== 'number' || !Number.isFinite(temp)) return { tone: '', amount: 0 };
  if (temp < 58) return { tone: 'cool', amount: Math.min(1, (58 - temp) / 18) };
  if (temp > 64) return { tone: 'warm', amount: Math.min(1, (temp - 64) / 18) };
  return { tone: '', amount: 0 };
}

// ---- Formatting ----
export function formatClock(minute) {
  const h = Math.floor(minute / 60) % 24, m = minute % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

export function formatTime(minute) {
  return `${formatClock(minute)} ${Math.floor(minute / 60) % 24 < 12 ? 'AM' : 'PM'}`;
}

export function formatHour(minute) {
  const h = Math.floor(minute / 60) % 24;
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
}

export function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** The tooltip/aria sentence for one tee time. */
export function describeTime({ time, unit, players, weather, sunset }) {
  const parts = [formatTime(time.minute), unit.name, `${booked(time)} booked`, `${time.availableSlots} open`];
  const price = priceOf(time);
  if (price !== null) {
    const notes = [time.rateSource === 'ratecard' ? 'public rate' : '', CART_INCLUDED.has(unit.courseId) ? 'incl. cart' : ''].filter(Boolean);
    parts.push([formatPrice(price), ...notes].join(' '));
  }
  if (weather && Number.isFinite(weather.temp)) parts.push(`${weather.temp}°`);
  if (weather && weather.rain >= 10) parts.push(`${weather.rain}% rain`);
  const finish = finishMinutes(time.minute, unit.holes);
  parts.push(finishesAfterSunset(time.minute, unit.holes, sunset) ? `finishes ~${formatTime(finish)}, after sunset` : `finishes ~${formatTime(finish)}`);
  if (time.availableSlots < players) parts.push(`not enough spots for ${players}`);
  return parts.join(' · ');
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
