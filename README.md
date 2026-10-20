# MCG Tee / MCG Tee-Time Pressure

An independent tee-time finder for Montgomery County courses, plus the original TenFore overlay.

Current build: `v0.5.0` (`2026-10-19`) — standalone MCG Tee, a cached public read API, Eastern calendar dates, and native booking links. The original bookmarklet and root preview remain available.

## Standalone Cloudflare edition

The hosted site reuses `app.js` and its course layout, player counts, capacity pills, time/score sorting, weather, empty states, and recovery controls. `site/index.html` sets `window.__MCG_HOSTED_APP__ = {apiRoot:'/api'}` before loading the script. When that flag is absent, the original preview/bookmarklet behavior applies.

One Cloudflare ESM Worker (`worker.mjs`) handles `/api/*`; all other paths go to the static assets binding. `npm run build` copies only the hosted HTML, favicon, headers, and shared script into a clean `dist/`. Root `index.html` continues to be the GitHub Pages bookmarklet preview. There is no database, polling, scheduled job, authentication, reservation API, payment handling, analytics, or CAPTCHA in the hosted edition.

The Worker is named `mcg-golf-time`, deployed at https://mcg-golf-time.support-27c.workers.dev. The chosen domain is `mcgtee.com`; registration and its custom-domain binding are pending. No production credential is checked in.

Requires a current Node.js version supported by pinned Wrangler `4.151.2` (Node 22 or newer recommended):

```bash
npm ci
npm test
node --check app.js
npm run build
npx wrangler deploy --dry-run
```

To preview the complete site and Worker locally:

```bash
npm run dev
```

Open `http://127.0.0.1:5187/`. No Cloudflare credentials are needed for local development; availability still requires internet access to TenFore. Useful checks are `/api/health`, `/api/courses`, and `/api/availability?courseId=16504&subCourseId=1032&date=YYYY-MM-DD` with a current Eastern date. Stop the preview with Ctrl-C. After Cloudflare authentication and domain setup, the deployment command is `npm run deploy`.

The deployment token is saved as `cloudflare-mcgtee` in the Personal Halfday vault. Deploy from this checkout using the named vault item:

```bash
CLOUDFLARE_ACCOUNT_ID=27c7803cb2d4bafbd74014b7c02c3954 "$STATION_CLI" secrets run --env CLOUDFLARE_API_TOKEN=cloudflare-mcgtee -- npm run deploy
```

The deployed Worker was checked through its public health, sanitized course list, and live Inside 9 availability endpoints. Its real Workers runtime uses `redirect: 'manual'` and rejects non-success statuses; the runtime does not support the browser/Node `redirect: 'error'` option.

### Hosted read API and freshness

- `GET /api/health` returns `{ok:true}`.
- `GET /api/courses` reads the public `GolfCourse/GetGolfCourseByVanity?vanityName=mcggolf` endpoint. The response contains only the nine MCG courses and an explicit allowlist of display fields, image URLs/types, and the two approved subcourses. Raw metadata, including unrelated payment processor fields, is never proxied.
- `GET /api/availability?courseId=16504&subCourseId=1032&date=YYYY-MM-DD` calls the ordinary public `BookingEngine/Get` endpoint. Its upstream `startDate` is the selected day and `endDate` is **the following day**. No modern verified endpoint is used as a fallback.
- Courses are limited to Falls Road (16503), Northwest (16504), Hampshire Greens (16506), Laytonsville (16507), Little Bennett (16508), Needwood (16509), Crossvines (16510), Rattlewood (16511), and Sligo Creek (16512). Subcourse 1032 is allowed only for Northwest Inside 9; 1031 only for Needwood Executive 9. Omit `subCourseId` or use `0` for a main course.
- Dates must round-trip as real calendar dates and fall between today and today + 7 in `America/New_York`, inclusive. Exact integer query values, course/subcourse pairs, supported parameters, and GET-only methods are validated before any upstream request. There is no arbitrary URL proxy or public cache-busting option.
- Availability is fresh for 60 seconds. If an upstream read fails, the last successful result may be returned only while its total age is at most five minutes, marked `meta.stale:true`. Course metadata is fresh for six hours, with error-only stale fallback up to 24 hours from its successful read. Both responses expose the original `meta.fetchedAt` timestamp. Failures are never cached; successful empty results are.
- Concurrent identical requests coalesce within an isolate. The Cloudflare Cache API shares sanitized entries at a data center; a bounded in-memory map supports local use and cache outages. Cache/coalescing is not global across every Cloudflare region. Client responses use `Cache-Control: no-store` so freshness metadata remains accurate. No wildcard CORS is enabled.
- Upstream reads time out after ten seconds, and hosted client reads after fifteen seconds. Bad envelopes, verification pages, invalid schemas, and HTTP failures show recoverable errors rather than an empty success. Errors expose safe messages, not raw upstream diagnostics.

The Worker normalizes legacy offsets such as `.000-4` into `.000-04:00`, filters to the selected Eastern date, and preserves authoritative `availableSlots` remaining capacity. `maxSlots` is total capacity, not another count to subtract. Rows include no customer data. Positive listing/fee prices are shown; zero or missing prices stay unknown, never advertised as free.

### Hosted booking and limits

Book is a normal new-tab link to `https://fox.tenfore.golf/:vanity/tee-time/:id?players=…&holes=…&backToSearch=true`. Modified clicks work naturally. The hosted site does not access TenFore's router or stores. TenFore may reset player/hole choices when opening a direct link, so the table asks visitors to confirm players, holes, and final price there. Availability can change before booking, and all reservations and any sign-in/payment happen on MCG Golf / TenFore.

Hosted date buttons, custom-date validation, times, and weather matching use Eastern time regardless of the visitor's timezone. After 5pm Eastern the initial selection is tomorrow. Returning to a course/date refreshes a client result older than 60 seconds; Refresh and Retry request the same shared server cache without bypassing it. There is no automatic background polling. A page left open keeps its last check time visible; Refresh requests an updated check.

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
