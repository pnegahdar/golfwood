import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../site/lib.mjs';

const t = (minute, availableSlots = 4, extra = {}) => ({ teeTimeID: 1, minute, availableSlots, maxSlots: 4, priceBeforeTax: null, ...extra });

test('derives eleven bookable units with short names, 9-hole classification and order', () => {
  const units = lib.deriveUnits(lib.FALLBACK_COURSES);
  assert.equal(units.length, 11);
  assert.deepEqual(units.map(u => u.name), [
    'Crossvines', 'Falls Road', 'Hampshire Greens', 'Laytonsville', 'Little Bennett', 'Needwood', 'Northwest', 'Rattlewood',
    'Needwood Exec 9', 'Northwest Inside 9', 'Sligo Creek'
  ]);
  assert.deepEqual(units.filter(u => u.holes === 9).map(u => u.key), ['16509:1031', '16504:1032', '16512:0']);
  const inside = units.find(u => u.key === '16504:1032');
  assert.equal(inside.vanityName, 'northwest');
  assert.equal(inside.subCourseId, 1032);
  assert.equal(lib.filterUnits(units, '9').length, 3);
  assert.equal(lib.filterUnits(units, '18').length, 8);
  assert.equal(lib.filterUnits(units, 'all').length, 11);
  assert.equal(lib.shortName('Golf at The Crossvines'), 'Crossvines');
});

test('Eastern dates: initial day moves to tomorrow at 5pm, and the strip is today plus seven', () => {
  assert.equal(lib.initialDate(Date.parse('2026-10-19T20:59:00Z')), '2026-10-19'); // 4:59pm EDT
  assert.equal(lib.initialDate(Date.parse('2026-10-19T21:00:00Z')), '2026-10-20'); // 5:00pm EDT
  assert.equal(lib.initialDate(Date.parse('2026-10-20T03:30:00Z')), '2026-10-20'); // 11:30pm EDT on the 19th
  assert.equal(lib.todayET(Date.parse('2026-10-20T03:30:00Z')), '2026-10-19');
  assert.equal(lib.todayET(Date.parse('2026-11-02T04:30:00Z')), '2026-11-01'); // 11:30pm EST after DST ends
  assert.equal(lib.initialDate(Date.parse('2026-11-01T21:59:00Z')), '2026-11-01'); // 4:59pm EST
  const days = lib.nextDays(8, Date.parse('2026-10-31T14:00:00Z'));
  assert.equal(days.length, 8);
  assert.deepEqual([days[0], days[1], days[7]], ['2026-10-31', '2026-11-01', '2026-11-07']);
  assert.deepEqual(lib.dayLabel('2026-10-20'), { weekday: 'Tue', day: 20, long: 'Tuesday, Oct 20' });
});

test('parses wall-clock minutes from TenFore timestamps', () => {
  assert.equal(lib.minutesOf('2026-10-20T07:28:00.000-04:00'), 448);
  assert.equal(lib.minutesOf('2026-11-03T16:05:00-05:00'), 965);
  assert.equal(lib.clockMinutes('18:22'), 1102);
  assert.equal(lib.minutesOf('bad'), null);
  const rows = lib.prepareTimes([{ dateScheduled: '2026-10-20T09:00:00-04:00' }, { dateScheduled: '2026-10-20T07:30:00-04:00' }], 8 * 60);
  assert.deepEqual(rows.map(r => r.minute), [540]);
});

test('timeline range covers tee times, sunrise and sunset, and drops the past for today', () => {
  assert.deepEqual(lib.timelineRange({ minutes: [448, 1196], sunrise: 443, sunset: 1102, interval: 11 }), { start: 420, end: 1260, span: 840 });
  assert.deepEqual(lib.timelineRange({ minutes: [480, 900], sunrise: 443, sunset: 1102 }), { start: 420, end: 1140, span: 720 });
  assert.deepEqual(lib.timelineRange({ minutes: [900, 960], sunrise: 443, sunset: 1102, now: 14 * 60 + 20 }), { start: 840, end: 1140, span: 300 });
  assert.deepEqual(lib.timelineRange({ minutes: [] }), { start: 360, end: 1200, span: 840 });
  const range = { start: 420, end: 1260, span: 840 };
  assert.equal(lib.xPercent(420, range), 0);
  assert.equal(lib.xPercent(840, range), 50);
  assert.equal(lib.hourTicks({ start: 420, end: 600, span: 180 }).length, 4);
  assert.equal(lib.typicalInterval([448, 459, 492, 624, 635, 646]), 11);
});

test('fits respects players and the empty-only filter', () => {
  assert.equal(lib.fits(t(480, 2), 2), true);
  assert.equal(lib.fits(t(480, 2), 3), false);
  assert.equal(lib.fits(t(480, 2), 2, true), false);
  assert.equal(lib.fits(t(480, 4), 4, true), true);
  assert.equal(lib.fitState(t(480, 2), 2, true), 'muted');
  assert.equal(lib.fitState(t(480, 1), 2, true), 'none');
  assert.equal(lib.fitState(t(480, 3), 2, false), 'fit');
  assert.equal(lib.booked(t(480, 1)), 3);
});

test('finish time flags rounds that end after sunset', () => {
  const sunset = lib.clockMinutes('18:22');
  assert.equal(lib.finishMinutes(600, 18), 855);
  assert.equal(lib.finishMinutes(600, 9), 725);
  assert.equal(lib.finishesAfterSunset(14 * 60 + 25, 18, sunset), true);
  assert.equal(lib.finishesAfterSunset(14 * 60 + 25, 9, sunset), false);
  assert.equal(lib.finishesAfterSunset(14 * 60, 18, sunset), false);
  assert.equal(lib.finishesAfterSunset(14 * 60, 18, null), false);
  const unit = { name: 'Northwest', holes: 18 };
  assert.equal(lib.describeTime({ time: t(14 * 60 + 25, 2, { priceBeforeTax: 29 }), unit, players: 2, weather: { temp: 52, rain: 10 }, sunset }),
    '2:25 PM · Northwest · 2 booked · 2 open · $29 · 52° · 10% rain · finishes ~6:40 PM, after sunset');
  assert.match(lib.describeTime({ time: t(490, 1), unit, players: 3, weather: null, sunset }), /^8:10 AM · Northwest · 3 booked · 1 open · finishes ~12:25 PM · not enough spots for 3$/);
});

test('booking URLs use each unit vanity, players and holes', () => {
  const units = lib.deriveUnits(lib.FALLBACK_COURSES);
  const inside = new URL(lib.bookingUrl(units.find(u => u.key === '16504:1032'), { teeTimeID: 11495453 }, 3));
  assert.equal(inside.origin + inside.pathname, 'https://fox.tenfore.golf/gctt/16504/11495453');
  assert.deepEqual(Object.fromEntries(inside.searchParams), { players: '3', holes: '9' });
  assert.equal(lib.bookingUrl(units.find(u => u.key === '16510:0'), { teeTimeID: 42 }, 2), 'https://fox.tenfore.golf/gctt/16510/42?players=2&holes=18');
  assert.equal(lib.bookingUrl(units.find(u => u.key === '16509:1031'), { teeTimeID: 'a-1' }, 1), 'https://fox.tenfore.golf/gctt/16509/a-1?players=1&holes=9');
});

test('price ranges skip unknown prices', () => {
  assert.equal(lib.priceRange([t(1), t(2)]), null);
  assert.equal(lib.formatPriceRange(lib.priceRange([t(1, 4, { priceBeforeTax: 45 }), t(2), t(3, 4, { priceBeforeTax: 29 })])), '$29–$45');
  assert.equal(lib.formatPriceRange(lib.priceRange([t(1, 4, { priceBeforeTax: 35.5 })])), '$35.50');
  assert.equal(lib.formatPriceRange(null), '');
});

test('formatting and tints', () => {
  assert.equal(lib.formatClock(460), '7:40');
  assert.equal(lib.formatTime(12 * 60 + 5), '12:05 PM');
  assert.equal(lib.formatHour(7 * 60), '7a');
  assert.equal(lib.formatHour(12 * 60), '12p');
  assert.equal(lib.formatHour(18 * 60), '6p');
  assert.equal(lib.formatAgo(40_000), '40s ago');
  assert.equal(lib.formatAgo(3 * 60_000), '3m ago');
  assert.equal(lib.formatDuration(659), '10h 59m');
  assert.equal(lib.temperatureTint(40).tone, 'cool');
  assert.equal(lib.temperatureTint(61).tone, '');
  assert.equal(lib.temperatureTint(90).amount, 1);
  assert.equal(lib.temperatureTint(null).tone, '');
  assert.equal(lib.escapeHTML('<a href="x">&\''), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});
