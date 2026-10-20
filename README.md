# MCG Tee / MCG Tee-Time Pressure

An independent tee-time finder for Montgomery County courses, plus the original TenFore overlay.

Current build: `v0.5.0` (`2026-10-19`) — standalone MCG Tee, a cached public read API, Eastern calendar dates, and native booking links. The original bookmarklet and root preview remain available.

## Standalone Cloudflare edition

The hosted site is its own small frontend in `site/` and no longer loads `app.js` (the bookmarklet keeps using it unchanged). One page shows one day across all eleven bookable units — the nine courses plus Northwest Inside 9 and Needwood Executive 9:

- **Top bar:** day strip (today + 7, Eastern; hi/lo, rain ≥20%, and how many tee times fit once that day has loaded), Players 1–4, Holes All/18/9, and **Empty tee times only**. All three filters persist in `localStorage`. After 5pm Eastern the page opens on tomorrow; `?date=YYYY-MM-DD` selects a day.
- **Day band:** sunrise, sunset, daylight, hi/lo, rain, wind ≥15 mph, a small legend, and “Updated … ago · Refresh”. Returning to the tab refetches when the day is older than 60 seconds.
- **Desktop (≥900px):** a proportional timeline. Hour axis, hourly temperature/rain strip, dusk shading before sunrise and after sunset, and a now-line for today, which hides past times. One row per unit with “holes · price range · N open”. Each tee time is a block with one pip per spot (filled = booked, hollow = open): green when it fits the party, outlined when it fits but already has players and Empty-only is on, grey and unlinked when too few spots remain. An orange top edge means an 18-hole round (4h15m) or 9-hole round (2h05m) would finish after sunset. Hover/focus shows a tooltip with time, course, booked/open, price, temperature, rain, and estimated finish.
- **Mobile (<900px):** one section per unit with wrapping time chips, inline hour/temperature and sunset markers. Units with nothing that fits collapse into one line. Add `?layout=mobile` or `?layout=desktop` to force a layout for debugging.
- A failed unit shows “Couldn’t load · Retry” in its own row and retries only that unit. Weather is optional; without it the page simply omits weather details.

Files: `site/index.html`, `site/styles.css`, `site/main.mjs` (state, fetches, rendering), and `site/lib.mjs` (pure helpers, tested by `tests/site.test.mjs`). `site/_headers` sets a same-origin CSP.

One Cloudflare ESM Worker handles `/api/*`; all other paths go to the static assets binding. `worker.mjs` is only the entry point: it exports the Worker and the `UpstreamCache` Durable Object. Everything testable lives in `api.mjs`: input validation, sanitizers, the rate card, the cache core (`createUpstreamCache`), the upstream service that runs inside the Durable Object (`createUpstreamService`), and the Worker routes (`createWorker`). `npm run build` copies the `site/` files (HTML, CSS, two modules, favicon, headers) into a clean `dist/`. Root `index.html` continues to be the GitHub Pages bookmarklet preview. There is no database beyond the Durable Object's cache storage, and no polling, scheduled job, authentication, reservation API, payment handling, analytics, or CAPTCHA in the hosted edition.

The Worker is named `mcg-golf-time` and runs on the owner's personal Cloudflare account. It is live at https://mcgtee.com, with custom domains `mcgtee.com` and `www.mcgtee.com` (set in `wrangler.jsonc` `routes`), and at https://mcg-golf-time.pnegahdar.workers.dev. No production credential is checked in.

Requires a current Node.js version supported by pinned Wrangler `4.151.2` (Node 22 or newer recommended):

```bash
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
```

To preview the complete site and Worker locally:

```bash
npm run dev
```

Open `http://127.0.0.1:5187/`. No Cloudflare credentials are needed for local development; availability still requires internet access to TenFore. Useful checks are `/api/health`, `/api/courses`, `/api/day?date=YYYY-MM-DD`, `/api/weather`, and `/api/availability?courseId=16504&subCourseId=1032&date=YYYY-MM-DD` with a current Eastern date. Stop the preview with Ctrl-C. With Cloudflare credentials for the personal account, the deployment command is `npm run deploy`.

The deployment token for the personal account is saved as `cloudflare-mcgtee` in the Personal Halfday vault. Deploy from this checkout using the named vault item:

```bash
CLOUDFLARE_ACCOUNT_ID=375871b8dc71bb64db4391232d86cec0 "$STATION_CLI" secrets run --env CLOUDFLARE_API_TOKEN=cloudflare-mcgtee -- npm run deploy
```

The deployed Worker was checked through its public health, sanitized course list, and live Inside 9 availability endpoints. Its real Workers runtime uses `redirect: 'manual'` and rejects non-success statuses; the runtime does not support the browser/Node `redirect: 'error'` option.

### Hosted read API and freshness

- `GET /api/health` returns `{ok:true}`.
- `GET /api/courses` reads the public `GolfCourse/GetGolfCourseByVanity?vanityName=mcggolf` endpoint. The response contains only the nine MCG courses and an explicit allowlist of display fields, image URLs/types, and the two approved subcourses. Raw metadata, including unrelated payment processor fields, is never proxied.
- `GET /api/availability?courseId=16504&subCourseId=1032&date=YYYY-MM-DD` calls the ordinary public `BookingEngine/Get` endpoint. Its upstream `startDate` is the selected day and `endDate` is **the following day**. For main courses the Worker omits `subCourseID`, because TenFore returns no rows for `subCourseID=0`. No modern verified endpoint is used as a fallback.
- `GET /api/day?date=YYYY-MM-DD` returns `{date, units:[…], meta:{fetchedAt}}` for all eleven units. Each unit is either `{courseId, subCourseId, ok:true, teeTimes, meta}` or `{courseId, subCourseId, ok:false, code, messageForUser}`. The Durable Object assembles the whole day from the same per-unit cache entries as `/api/availability`, plus rate cards. One failed unit does not fail the day. Date rules match `/api/availability`.
- `GET /api/weather` reads Open-Meteo once for the county center (39.154, −77.125), in Fahrenheit/mph and Eastern time, for nine days. It returns `{days:{date:{sunrise, sunset, high, low, rainMax, windMax}}, hours:{date:[{hour, temp, rain, wind, code}]}, meta}`, with numbers rounded. Upstream failures return a safe 502.
- Courses are limited to Falls Road (16503), Northwest (16504), Hampshire Greens (16506), Laytonsville (16507), Little Bennett (16508), Needwood (16509), Crossvines (16510), Rattlewood (16511), and Sligo Creek (16512). Subcourse 1032 is allowed only for Northwest Inside 9; 1031 only for Needwood Executive 9. Omit `subCourseId` or use `0` for a main course.
- Dates must round-trip as real calendar dates and fall between today and today + 7 in `America/New_York`, inclusive. Exact integer query values, course/subcourse pairs, supported parameters, and GET-only methods are validated before any upstream request. There is no arbitrary URL proxy or public cache-busting option.
- **One global cache.** Every TenFore and Open-Meteo request happens inside a single SQLite-backed Durable Object (`UpstreamCache`, addressed as `idFromName('global')`). Worldwide, there is at most one upstream request per cache key per freshness window. The Worker validates input and then makes exactly one Durable Object request per API call. Durable Objects with SQLite storage are available on Workers Free; KV is not used.
- Entries are stored as `{value, fetchedAt}` in Durable Object storage, with an in-memory copy. A fresh entry is returned as-is. A stale entry still inside its maximum stale age is returned immediately, and one background refresh starts. A missing or expired entry waits for one coalesced fetch.
- Freshness windows:

  | Data | Fresh for | Served stale for up to |
  |---|---|---|
  | Availability, today and tomorrow (Eastern) | 2 min | 30 min |
  | Availability, days 2–7 | 10 min | 30 min |
  | Course metadata and rate cards | 24 h | 7 days |
  | Weather | 30 min | 6 h |

- Responses carry the original `meta.fetchedAt` (the page's "Updated … ago") and `meta.stale:true` once an entry is past its fresh window.
- A failed upstream read is never cached. It starts a 30-second per-key backoff with no upstream retries. Within the stale window, the stale entry keeps being served; past it, the client gets a safe error. At most four upstream requests run at once inside the Durable Object. Availability entries for past days are pruned once per Eastern day.
- The Worker also keeps successful `/api/day`, `/api/courses`, and `/api/weather` responses in the local data center's Cache API for 30 seconds, to save Durable Object requests. Browsers still get `Cache-Control: no-store`, so freshness metadata remains accurate. The client refetches on focus or day switch when its copy is older than two minutes. No wildcard CORS is enabled.
- Free-plan budget to watch: one Durable Object request per uncached API call (100k/day free), plus one storage write per upstream refresh. That is about 10k–25k writes/day if the site is busy all day, against a 100k/day free allowance.
- Upstream reads time out after ten seconds, and hosted client reads after fifteen seconds. Bad envelopes, verification pages, invalid schemas, and HTTP failures show recoverable errors rather than an empty success. Errors expose safe messages, not raw upstream diagnostics.

The Worker normalizes legacy offsets such as `.000-4` into `.000-04:00`, filters to the selected Eastern date, and preserves authoritative `availableSlots` remaining capacity. `maxSlots` is total capacity, not another count to subtract. Rows include no customer data. Positive listing/fee prices are kept as `priceBeforeTax`. Zero or missing prices stay unknown, never advertised as free.

### Prices (public rate card)

TenFore returns $0 prices for main-course tee times, so prices come from the public rate card `GET https://swan.tenfore.golf/api/TeeFees?golfCourseID=N`, which needs no auth.
- Only `everyone:true` rows are kept, as `{title, start, end (minutes), days, startDate, endDate, price9, price18}`. Member, senior, and junior rates never leave the Durable Object.
- `publicRate(fees, unit, teeTimeISO)` in `api.mjs` picks the rows that match the tee time's Eastern weekday, date range, and minute. `subCourseID` is null even for subcourse rows, so rows are scoped by title: "Inside 9" rows apply only to Northwest Inside 9, "Exec" rows only to Needwood Executive 9, and all other rows only to main courses.
- Price is `price9` for 9-hole units (Inside 9, Exec 9, Sligo Creek) and `price18` otherwise. Values ≤ $0 or > $300 are ignored; Sligo's 18-hole price is listed as $500. If several rows match, the narrowest time window wins.
- Every tee time in `/api/day` and `/api/availability` gets `rate` and `rateSource`:
  - `teetime`: the feed's own positive price.
  - `ratecard`: the public rate.
  - `null`: no price found.
- On Oct 20, 2026, the rate card agreed with all 131 Inside 9 and Exec 9 feed prices: Inside 9 is $29 before 3 PM on weekdays and $27 after, and Exec 9 is $24 on weekdays.
- The page shows prices like "$62 public rate", adds "incl. cart" for Hampshire Greens and Little Bennett, and says in the footer that these are public walking rates.

### Hosted booking and limits

Each bookable block/chip is a normal new-tab link to `https://fox.tenfore.golf/gctt/:courseId/:teeTimeId?players=…&holes=…`. TenFore's `/:vanity/tee-time/:id` route crashes (500, `reading 'vanityName'`) in any tab that hasn't already loaded the course, so it can't be used from another site; `/gctt/` loads the course itself and was verified cold in a fresh tab on Oct 19, 2026. `/gctt/` ignores `players`/`holes` and preselects every open spot, so the page tells visitors to set their player count on TenFore. Modified clicks work naturally. The hosted site does not access TenFore's router or stores. Availability can change before booking, and all reservations and any sign-in/payment happen on MCG Golf / TenFore.

Hosted date buttons, times, and weather matching use Eastern time regardless of the visitor's timezone. After 5pm Eastern the initial selection is tomorrow. Switching to a day or returning to the tab refreshes a client result older than 60 seconds. Refresh and Retry use the same shared server cache without bypassing it. There is no automatic background polling. A page left open keeps its last check time visible.

The overlay also exposes `window.__MCG_TEE_PRESSURE_VERSION__` after it runs. If the header does not show this build, replace the old bookmarklet with the one generated by the local preview page.

## Hosted bookmarklet

The bookmarklet is now a tiny loader. It loads `app.js` from the same place as `index.html`, adding a fresh cache-buster on each click.

- Published preview: `https://pnegahdar.github.io/golfwood/`
- Local preview generates a bookmarklet that loads `http://127.0.0.1:5177/app.js`.
- A GitHub Pages preview generates a bookmarklet that loads `https://<user>.github.io/<repo>/app.js`.
- Click the bookmarklet on the preview page to check whether the bookmarklet version matches the preview version.
- Click the bookmarklet off TenFore to open the MCG page. Click it again on TenFore to load the overlay.
- The preview page polls `app.js` and reloads itself when the script changes.

## What the original overlay calls

- `GET https://swan.tenfore.golf/api/GolfCourse/GetGolfCourseByVanity?vanityName=mcggolf`
- `GET https://swan.tenfore.golf/api/TeeTimes/Search?...` for the existing multi-course search UI.
- `POST https://swan.tenfore.golf/api/BookingEngineV4/booking-times`
- `GET https://swan.tenfore.golf/api/BookingEngineV4/booking-schedule?...` and `booking-dates?...` in the newer single-course flow.
- `GET https://api.open-meteo.com/v1/forecast?...` for no-key hourly temperature and rain status by course coordinates.
- `GET https://api.weather.gov/points/...` plus its hourly forecast URL as a no-key fallback when Open-Meteo is slow or unavailable.
- The tee-time endpoints require `X-TenFore-AppId: 23`, `X-Recaptcha-Token`, and `X-Recaptcha-Action`.
- Verification uses TenFore’s current `recaptchaPolicySiteKey` from its Nuxt runtime config, with an explicitly rendered Google reCAPTCHA script as a fallback. There is no frozen site key. Initialization is tracked per key, and every request executes verification again for a fresh token.
- Because the reCAPTCHA key is issued for `fox.tenfore.golf`, live data needs the overlay/bookmarklet to run on that origin.
- The main view is a flat table of returned tee times. It does not infer missing/full slots that TenFore does not return.

## Availability recovery

The overlay shows a loading state while the selected course and date are being checked. A successful response with zero tee times names that course and date and suggests another date. Verification, network, course-list, and API failures show “Couldn’t check tee times” with **Retry** and **Use TenFore** actions. Technical diagnostics stay in collapsed details.

Verification loading/readiness and token execution each have a 10-second limit; API requests have a 15-second limit after verification. Failed script loads can retry. A verification failure stops the fallback lookup because both tee-time endpoints require verification. API failure envelopes are treated as errors, including when HTTP reports success.

If verification returns an empty string while TenFore is loading, the overlay waits one second and retries token execution once. The preview uses a versioned script URL so a cached older build cannot mask the current release.

Requests and successful results, including empty results, are tracked by course and date. Late responses cannot replace the current selection’s state. Weather loads independently and cannot reopen an exited overlay.

## Booking handoff

Book loads the selected course into TenFore, sets or clears its subcourse, and opens the native booking page with the selected players, holes, and back-nine option. The overlay closes after the router confirms that destination. While opening, repeated clicks are ignored. A failed handoff keeps the overlay open with a retry message and a course-scoped native link; TenFore may reset player and hole choices when that fallback link is used. Modified clicks also use that native link. Preview examples open the course page because their sample IDs cannot be reserved.

Search results with `bookedPlayers` now subtract those players from capacity before enabling Book for the selected group size.

## Checks

The regression suite uses Node’s built-in test runner. Install the pinned development dependency for the hosted build and Wrangler preview:

```bash
node --check app.js
npm test
git diff --check
```

Live verification on 2026-10-19 used the local `v0.4.26` script on the real TenFore origin. Northwest Inside 9 (October 20, 7:40 AM) and Needwood 18 holes (October 20, 7:39 AM) each reached the correct native booking summary with three players. Switching to Needwood cleared Northwest’s subcourse. Verification stopped at the sign-in/booking form; no reservation was submitted.

A simulated network failure showed the recoverable error state, and Retry restored 34 live Needwood results. A real January 1 search returned zero results from both endpoints and showed the distinct empty state. Local preview links open real course pages. Captcha rotation, readiness and timeouts, API error envelopes, stale query responses, cancelled or redirected navigation, and duplicate booking clicks are also covered by the regression suite.

## Local preview

```bash
python3 -m http.server 5177
```

Open `http://127.0.0.1:5177/`.
