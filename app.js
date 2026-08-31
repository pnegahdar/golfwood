(function () {
  "use strict";

  var CONFIG = {
    apiRoot: "https://swan.tenfore.golf/api",
    weatherRoot: "https://api.open-meteo.com/v1/forecast",
    appId: 23,
    vanityName: "mcggolf",
    siteKey: "6LfAN9ksAAAAAFxnXFLRCuU9gUXs6U6egm6TrjIn",
    host: "fox.tenfore.golf"
  };

  var VERSION = {
    id: "v0.4.23",
    changedAt: "2026-08-31 12:43 EDT",
    note: "Infer Search availability with 1-4 player probes"
  };

  window.__MCG_TEE_PRESSURE_VERSION__ = VERSION;

  var COURSE_COORDS = {
    16503: { lat: 39.033, lon: -77.190 },
    16504: { lat: 39.112, lon: -77.043 },
    16506: { lat: 39.126, lon: -76.995 },
    16507: { lat: 39.207, lon: -77.146 },
    16508: { lat: 39.279, lon: -77.286 },
    16509: { lat: 39.113, lon: -77.128 },
    16510: { lat: 39.148, lon: -77.414 },
    16511: { lat: 39.333, lon: -77.190 },
    16512: { lat: 39.016, lon: -77.023 },
    fallback: { lat: 39.154, lon: -77.125 }
  };

  var STYLE = `
    :host, .mcg-app {
      color: #17201b;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    * {
      box-sizing: border-box;
    }

    button, input, select {
      font: inherit;
      letter-spacing: 0;
    }

    .mcg-shell {
      background: #f5f7f2;
      min-height: 100%;
      padding: 18px;
    }

    .mcg-panel {
      background: #ffffff;
      border: 1px solid #dfe6dc;
      border-radius: 8px;
      box-shadow: 0 20px 70px rgba(19, 31, 25, 0.14);
      margin: 0 auto;
      max-width: 1220px;
      min-width: 0;
      overflow: hidden;
    }

    .mcg-header {
      align-items: center;
      border-bottom: 1px solid #dfe6dc;
      display: grid;
      gap: 16px;
      grid-template-columns: 1fr auto;
      padding: 16px;
    }

    .mcg-title-row {
      align-items: center;
      display: flex;
      gap: 12px;
      min-width: 0;
    }

    .mcg-mark {
      align-items: center;
      background: #214236;
      border-radius: 8px;
      color: #ffffff;
      display: flex;
      flex: 0 0 42px;
      font-size: 12px;
      font-weight: 900;
      height: 42px;
      justify-content: center;
      width: 42px;
    }

    .mcg-title {
      font-size: 20px;
      font-weight: 850;
      line-height: 1.1;
      margin: 0;
      overflow-wrap: anywhere;
    }

    .mcg-subtitle {
      color: #627168;
      font-size: 13px;
      margin-top: 4px;
    }

    .mcg-controls {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .mcg-weekdays {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
      max-width: 760px;
    }

    .mcg-chip {
      background: #f8faf6;
      border: 1px solid #cfd9cd;
      border-radius: 8px;
      color: #17201b;
      cursor: pointer;
      font-size: 12px;
      font-weight: 850;
      height: 32px;
      padding: 0 9px;
      white-space: nowrap;
    }

    .mcg-chip.active {
      background: #214236;
      border-color: #214236;
      color: #ffffff;
    }

    .mcg-day-chip {
      display: grid;
      gap: 1px;
      height: 46px;
      min-width: 72px;
      padding: 4px 8px;
      place-items: center;
    }

    .mcg-day-name {
      font-size: 12px;
      font-weight: 950;
      line-height: 1;
    }

    .mcg-day-weather {
      align-items: center;
      display: flex;
      font-size: 11px;
      font-weight: 800;
      gap: 4px;
      line-height: 1;
    }

    .mcg-weather-icon {
      display: inline-block;
      font-size: 14px;
      line-height: 1;
      text-align: center;
      width: 16px;
    }

    .mcg-sort-toggle {
      background: #f8faf6;
      border: 1px solid #cfd9cd;
      border-radius: 8px;
      display: inline-flex;
      height: 38px;
      overflow: hidden;
    }

    .mcg-toggle {
      background: transparent;
      border: 0;
      color: #17201b;
      cursor: pointer;
      font-size: 12px;
      font-weight: 900;
      padding: 0 10px;
      white-space: nowrap;
    }

    .mcg-toggle.active {
      background: #214236;
      color: #ffffff;
    }

    .mcg-player-control {
      align-items: center;
      background: #f8faf6;
      border: 1px solid #cfd9cd;
      border-radius: 8px;
      color: #17201b;
      display: inline-flex;
      font-size: 12px;
      font-weight: 900;
      gap: 7px;
      height: 38px;
      padding: 0 8px;
      white-space: nowrap;
    }

    .mcg-player-input {
      background: #ffffff;
      border: 1px solid #dfe6dc;
      border-radius: 6px;
      color: #17201b;
      font-size: 14px;
      font-weight: 950;
      height: 28px;
      padding: 0 4px;
      text-align: center;
      width: 42px;
    }

    .mcg-date-custom {
      align-items: center;
      display: inline-flex;
      gap: 6px;
    }

    .mcg-custom-date {
      max-width: 150px;
      min-width: 142px;
    }

    .mcg-date-apply {
      height: 38px;
      padding: 0 10px;
    }

    .mcg-input, .mcg-select {
      background: #ffffff;
      border: 1px solid #cfd9cd;
      border-radius: 8px;
      color: #17201b;
      height: 38px;
      padding: 0 10px;
    }

    .mcg-button {
      align-items: center;
      background: #214236;
      border: 1px solid #214236;
      border-radius: 8px;
      color: #ffffff;
      cursor: pointer;
      display: inline-flex;
      font-weight: 800;
      height: 38px;
      justify-content: center;
      padding: 0 12px;
      white-space: nowrap;
    }

    .mcg-button.secondary {
      background: #ffffff;
      border-color: #cfd9cd;
      color: #17201b;
    }

    .mcg-button:disabled {
      cursor: wait;
      opacity: .58;
    }

    .mcg-body {
      display: grid;
      grid-template-columns: 270px 1fr;
      min-height: 620px;
    }

    .mcg-sidebar {
      background: #f8faf6;
      border-right: 1px solid #dfe6dc;
      padding: 14px;
    }

    .mcg-sidebar-title {
      color: #627168;
      font-size: 11px;
      font-weight: 900;
      margin: 4px 0 10px;
      text-transform: uppercase;
    }

    .mcg-course-list {
      display: grid;
      gap: 8px;
      min-width: 0;
    }

    .mcg-course {
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      color: #17201b;
      cursor: pointer;
      display: grid;
      gap: 10px;
      grid-template-columns: 44px 1fr auto;
      min-height: 58px;
      padding: 6px;
      text-align: left;
      width: 100%;
    }

    .mcg-course.active {
      background: #ffffff;
      border-color: #b8c8b5;
      box-shadow: 0 8px 24px rgba(19, 31, 25, 0.08);
    }

    .mcg-course img, .mcg-course-fallback {
      aspect-ratio: 1;
      background: #dfe6dc;
      border-radius: 8px;
      height: 44px;
      object-fit: cover;
      width: 44px;
    }

    .mcg-course-fallback {
      align-items: center;
      color: #214236;
      display: flex;
      font-size: 12px;
      font-weight: 900;
      justify-content: center;
    }

    .mcg-course-name {
      display: block;
      font-size: 13px;
      font-weight: 850;
      line-height: 1.15;
    }

    .mcg-course-meta {
      color: #6f7f75;
      display: block;
      font-size: 12px;
      margin-top: 3px;
    }

    .mcg-count {
      background: #e8eee5;
      border-radius: 999px;
      color: #2f493d;
      font-size: 12px;
      font-weight: 850;
      min-width: 28px;
      padding: 4px 8px;
      text-align: center;
    }

    .mcg-main {
      min-width: 0;
      padding: 16px;
    }

    .mcg-summary {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 14px;
    }

    .mcg-stat {
      background: #f8faf6;
      border: 1px solid #dfe6dc;
      border-radius: 8px;
      min-height: 60px;
      padding: 10px;
    }

    .mcg-stat-label {
      color: #627168;
      font-size: 11px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .mcg-stat-value {
      font-size: 21px;
      font-weight: 900;
      margin-top: 5px;
    }

    .mcg-status {
      align-items: center;
      background: #fff8e6;
      border: 1px solid #ead8a2;
      border-radius: 8px;
      color: #5d4817;
      display: none;
      font-size: 13px;
      gap: 10px;
      line-height: 1.35;
      margin-bottom: 14px;
      overflow-wrap: anywhere;
      padding: 10px 12px;
    }

    .mcg-status.show {
      display: flex;
    }

    .mcg-section-head {
      align-items: end;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      margin: 0 0 10px;
    }

    .mcg-section-title {
      font-size: 15px;
      font-weight: 900;
    }

    .mcg-section-note {
      color: #627168;
      font-size: 12px;
    }

    .mcg-times {
      display: grid;
      gap: 10px;
    }

    .mcg-bucket {
      background: #ffffff;
      border: 1px solid #dfe6dc;
      border-radius: 8px;
      overflow: hidden;
    }

    .mcg-bucket.best {
      border-color: #6f9c82;
      box-shadow: inset 3px 0 0 #2d7b55;
    }

    .mcg-bucket-head {
      align-items: center;
      background: #f8faf6;
      border: 0;
      border-bottom: 1px solid #dfe6dc;
      color: inherit;
      cursor: pointer;
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(132px, 1fr) auto minmax(78px, auto) 24px;
      min-height: 42px;
      padding: 7px 10px;
      text-align: left;
      width: 100%;
    }

    .mcg-bucket-title {
      align-items: baseline;
      display: flex;
      font-size: 15px;
      font-weight: 950;
      gap: 8px;
      min-width: 0;
      white-space: nowrap;
    }

    .mcg-bucket-price {
      color: #627168;
      font-size: 12px;
      font-weight: 900;
    }

    .mcg-temp {
      color: #3e4f46;
      font-size: 14px;
      font-weight: 950;
      justify-self: end;
      white-space: nowrap;
    }

    .mcg-fill {
      align-items: center;
      border: 1px solid transparent;
      border-radius: 999px;
      display: inline-flex;
      font-size: 13px;
      font-weight: 950;
      gap: 6px;
      justify-self: end;
      min-width: 70px;
      padding: 5px 8px;
      white-space: nowrap;
    }

    .mcg-fill-dot {
      border-radius: 999px;
      flex: 0 0 8px;
      height: 8px;
      width: 8px;
    }

    .mcg-fill.low {
      background: #e8f5ee;
      border-color: #b7d9c5;
      color: #1f6d49;
    }

    .mcg-fill.low .mcg-fill-dot {
      background: #27865b;
    }

    .mcg-fill.mid {
      background: #fff4d6;
      border-color: #e8cf85;
      color: #7b510f;
    }

    .mcg-fill.mid .mcg-fill-dot {
      background: #c27a16;
    }

    .mcg-fill.high {
      background: #ffe8e3;
      border-color: #efb4a8;
      color: #8b3327;
    }

    .mcg-fill.high .mcg-fill-dot {
      background: #c84b39;
    }

    .mcg-fill.unknown {
      background: #eef1eb;
      border-color: #d4ddd1;
      color: #65756b;
    }

    .mcg-fill.unknown .mcg-fill-dot {
      background: #96a69c;
    }

    .mcg-chevron {
      color: #7b8a80;
      font-size: 16px;
      font-weight: 950;
      justify-self: end;
      line-height: 1;
      transform: rotate(0deg);
      transition: transform .15s ease;
    }

    .mcg-bucket.expanded .mcg-chevron {
      transform: rotate(90deg);
    }

    .mcg-bucket-rows {
      display: grid;
    }

    .mcg-bucket-rows .mcg-time {
      border: 0;
      border-radius: 0;
      border-top: 1px solid #edf1ea;
      min-height: 44px;
      padding: 6px 10px;
    }

    .mcg-bucket-rows .mcg-time:first-child {
      border-top: 0;
    }

    .mcg-time {
      background: #ffffff;
      border: 1px solid #dfe6dc;
      border-radius: 8px;
      display: grid;
      gap: 8px;
      grid-template-columns: 86px 1fr minmax(70px, auto) 46px;
      min-height: 38px;
      padding: 6px 10px;
      align-items: center;
    }

    .mcg-time.unbookable {
      background: #fbfcfa;
    }

    .mcg-time.inferred {
      background: #fbfcfa;
      color: #627168;
    }

    .mcg-time.inferred .mcg-time-clock {
      color: #4f5f55;
    }

    .mcg-time.best {
      border-color: #6f9c82;
      box-shadow: inset 3px 0 0 #2d7b55;
    }

    .mcg-time-clock {
      font-size: 15px;
      font-weight: 950;
      line-height: 1;
      white-space: nowrap;
    }

    .mcg-price {
      color: #3e4f46;
      font-size: 13px;
      font-weight: 900;
      min-width: 0;
      white-space: nowrap;
    }

    .mcg-badge {
      background: #edf5ef;
      border-radius: 999px;
      color: #246344;
      font-size: 12px;
      font-weight: 900;
      padding: 5px 8px;
      white-space: nowrap;
    }

    .mcg-badge.busy {
      background: #fff1db;
      color: #845012;
    }

    .mcg-micro {
      color: #627168;
      font-size: 12px;
      grid-column: 4;
      justify-self: end;
      line-height: 1.35;
    }

    .mcg-assumed {
      color: #7b8a80;
      font-size: 10px;
      font-weight: 850;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .mcg-course-line {
      color: #3e4f46;
      font-size: 12px;
      line-height: 1.2;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mcg-metric {
      display: grid;
      gap: 1px;
    }

    .mcg-metric strong {
      font-size: 15px;
      line-height: 1;
    }

    .mcg-metric span {
      color: #627168;
      font-size: 10px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .mcg-link {
      color: #214236;
      font-size: 12px;
      font-weight: 900;
      grid-column: 4;
      justify-self: end;
      text-decoration: none;
      white-space: nowrap;
    }

    .mcg-time-fill {
      grid-column: 3;
    }

    .mcg-empty {
      align-items: center;
      background: #f8faf6;
      border: 1px dashed #b8c8b5;
      border-radius: 8px;
      color: #627168;
      display: flex;
      min-height: 86px;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }

    .mcg-empty-inner {
      display: grid;
      gap: 10px;
      justify-items: center;
      max-width: 640px;
    }

    .mcg-empty-title {
      font-size: 15px;
      font-weight: 800;
      line-height: 1.35;
    }

    .mcg-debug {
      background: #ffffff;
      border: 1px solid #dfe6dc;
      border-radius: 8px;
      color: #4c5f54;
      font-size: 11px;
      line-height: 1.45;
      padding: 8px 10px;
      text-align: left;
      width: 100%;
    }

    .mcg-spinner {
      animation: mcg-spin .9s linear infinite;
      border: 2px solid #d8e3d4;
      border-top-color: #214236;
      border-radius: 50%;
      height: 18px;
      width: 18px;
    }

    @keyframes mcg-spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 900px) {
      .mcg-header {
        grid-template-columns: 1fr;
      }

      .mcg-controls {
        justify-content: flex-start;
      }

      .mcg-body {
        grid-template-columns: 1fr;
      }

      .mcg-sidebar {
        border-right: 0;
        border-bottom: 1px solid #dfe6dc;
        min-width: 0;
      }

      .mcg-course-list {
        display: flex;
        overflow-x: auto;
        padding-bottom: 4px;
        width: 100%;
      }

      .mcg-course {
        flex: 0 0 220px;
      }

      .mcg-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 560px) {
      .mcg-shell {
        padding: 8px;
      }

      .mcg-header, .mcg-main {
        padding: 12px;
      }

      .mcg-controls {
        display: grid;
        grid-template-columns: 1fr 1fr;
        width: 100%;
      }

      .mcg-weekdays {
        grid-column: 1 / -1;
        justify-content: flex-start;
        overflow-x: auto;
        flex-wrap: nowrap;
        max-width: 100%;
        padding-bottom: 2px;
      }

      .mcg-input, .mcg-select, .mcg-button {
        width: 100%;
      }

      .mcg-sort-toggle {
        width: 100%;
      }

      .mcg-toggle {
        flex: 1;
      }

      .mcg-player-control {
        justify-content: center;
        width: 100%;
      }

      .mcg-summary {
        grid-template-columns: 1fr;
      }

      .mcg-times {
        grid-template-columns: 1fr;
      }

      .mcg-bucket-head {
        grid-template-columns: minmax(96px, 1fr) auto minmax(70px, auto) 18px;
        gap: 6px;
      }

      .mcg-time {
        grid-template-columns: 74px 1fr minmax(70px, auto) 46px;
      }
    }
  `;

  var DEMO_COURSES = [
    {
      id: 16504,
      subCourseId: 1032,
      label: "Northwest Inside 9",
      fullName: "Northwest Golf Course",
      subCourseName: "Inside 9",
      vanityName: "northwest",
      maxPlayers: 4,
      defaultHoles: 9,
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/tenfore-buck.appspot.com/o/golf-course-images%2F16504-97DI90.png?alt=media&token=caa62b8f-5ce8-4fba-bd95-08e6edc86cd3"
    },
    {
      id: 16504,
      fullName: "Northwest Golf Course",
      label: "Northwest",
      vanityName: "northwest",
      maxPlayers: 4,
      defaultHoles: 18,
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/tenfore-buck.appspot.com/o/golf-course-images%2F16504-97DI90.png?alt=media&token=caa62b8f-5ce8-4fba-bd95-08e6edc86cd3"
    },
    {
      id: 16509,
      label: "Needwood",
      fullName: "Needwood Golf Course",
      vanityName: "needwood",
      maxPlayers: 4,
      defaultHoles: 18,
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/tenfore-buck.appspot.com/o/golf-course-images%2F16509-M6WUVF.png?alt=media&token=4d130f41-dc95-4a60-982a-0f1636e158bc"
    },
    {
      id: 16503,
      label: "Falls Road",
      fullName: "Falls Road Golf Course",
      vanityName: "fallsroad",
      maxPlayers: 4,
      defaultHoles: 18,
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/tenfore-buck.appspot.com/o/golf-course-images%2F16503-KJHWF1.png?alt=media&token=3499e960-9089-4a2c-9735-a6a47fb7bc05"
    },
    {
      id: 16512,
      label: "Sligo Creek",
      fullName: "Sligo Creek Golf Course",
      vanityName: "SligoCreek",
      maxPlayers: 4,
      defaultHoles: 9,
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/tenfore-buck.appspot.com/o/golf-course-images%2F16512-YYL27Q.png?alt=media&token=50da214b-0a94-4767-9167-c347b0faf063"
    }
  ];

  var DEMO_TIMES = [
    ["06:40", 0, "northwest"], ["06:50", 4, "northwest"], ["07:10", 2, "northwest"], ["07:50", 1, "northwest"], ["08:30", 3, "northwest"], ["10:20", 0, "northwest"], ["13:40", 2, "northwest"],
    ["06:55", 1, "needwood"], ["07:35", 0, "needwood"], ["08:15", 2, "needwood"], ["09:05", 3, "needwood"], ["11:35", 1, "needwood"],
    ["07:00", 0, "fallsroad"], ["08:00", 1, "fallsroad"], ["10:10", 2, "fallsroad"], ["12:20", 0, "fallsroad"],
    ["07:45", 2, "SligoCreek"], ["09:15", 0, "SligoCreek"], ["11:25", 1, "SligoCreek"]
  ];

  var state = {
    live: location.hostname === CONFIG.host,
    loading: false,
    booted: false,
    courses: [],
    selectedKey: "",
    date: todayISO(),
    draftDate: "",
    players: initialPlayers(),
    sort: initialSort(),
    showCustomDate: false,
    timesByCourse: new Map(),
    debugByCourse: new Map(),
    weatherByCourseDate: new Map(),
    bookingCourseByVanity: new Map(),
    expandedBuckets: new Set(),
    error: "",
    root: null,
    shadow: null
  };

  if (window.__mcgTeePressureCleanup) {
    window.__mcgTeePressureCleanup();
  }

  window.__mcgTeePressureCleanup = function () {
    var old = document.getElementById("mcg-tee-pressure-root");
    if (old) old.remove();
    var preview = document.getElementById("mcg-preview-root");
    if (preview && preview.shadowRoot) preview.shadowRoot.innerHTML = "";
    if (preview) preview.innerHTML = "";
  };

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function todayISO() {
    var date = new Date();
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function isISODate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function focusCustomDate() {
    var input = state.shadow && state.shadow.querySelector('[data-action="date-draft"]');
    if (!input) return;

    input.focus({ preventScroll: true });

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch (error) {
        // showPicker can fail without direct browser gesture; focusing still helps.
      }
    }
  }

  function initialSort() {
    try {
      var value = localStorage.getItem("mcg-pressure-sort");
      return value === "score" || value === "time" ? value : "time";
    } catch (error) {
      return "time";
    }
  }

  function clampPlayers(value) {
    var players = parseInt(value, 10);
    if (!Number.isFinite(players)) return 1;
    return Math.max(1, Math.min(4, players));
  }

  function initialPlayers() {
    try {
      return clampPlayers(localStorage.getItem("mcg-pressure-players"));
    } catch (error) {
      return 1;
    }
  }

  function persistPlayers(value) {
    state.players = clampPlayers(value);
    try {
      localStorage.setItem("mcg-pressure-players", String(state.players));
    } catch (error) {
      // Storage can be unavailable in private modes; player count should still work.
    }
  }

  function persistSort(value) {
    state.sort = value === "score" ? "score" : "time";
    try {
      localStorage.setItem("mcg-pressure-sort", state.sort);
    } catch (error) {
      // Storage can be unavailable in private modes; sorting should still work.
    }
  }

  function dateISO(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function addDays(date, days) {
    var next = new Date(date);
    next.setDate(date.getDate() + days);
    return next;
  }

  function nextSevenChoices() {
    var today = new Date();
    today.setHours(12, 0, 0, 0);

    return Array.from({ length: 7 }, function (_, index) {
      var date = addDays(today, index);
      return {
        label: date.toLocaleDateString([], { weekday: "short" }),
        shortDate: (date.getMonth() + 1) + "/" + date.getDate(),
        value: dateISO(date)
      };
    });
  }

  function nextSevenRange() {
    var days = nextSevenChoices();
    return {
      start: days[0].value,
      end: days[days.length - 1].value
    };
  }

  function selectedDateInNextSeven() {
    return nextSevenChoices().some(function (choice) { return choice.value === state.date; });
  }

  function shortCourseName(name) {
    return String(name || "").replace(/\s+Golf Course$/i, "").replace(/^Golf at The\s+/i, "The ");
  }

  function courseKey(course) {
    return course.id + ":" + (course.subCourseId || 0);
  }

  function requestKey(course) {
    return [courseKey(course), state.date].join(":");
  }

  function withCourseCoords(course) {
    var coords = COURSE_COORDS[course.id] || COURSE_COORDS.fallback;
    return Object.assign({}, course, {
      weatherLat: coords.lat,
      weatherLon: coords.lon
    });
  }

  function debugText(value) {
    return value === null || value === undefined || value === "" ? "-" : value;
  }

  function numberFrom(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function firstNumber(raw, keys) {
    for (var index = 0; index < keys.length; index++) {
      var key = keys[index];
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        var value = numberFrom(raw[key]);
        if (value != null) return { value: value, source: key };
      }
    }
    return null;
  }

  function booleanFrom(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === "true";
    return null;
  }

  function firstBoolean(raw, keys) {
    for (var index = 0; index < keys.length; index++) {
      var key = keys[index];
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        var value = booleanFrom(raw[key]);
        if (value != null) return { value: value, source: key };
      }
    }
    return null;
  }

  function hasSearchShape(raw) {
    return raw && (raw.teeTimeId || raw.teeTimeID || raw.priceBeforeTax != null || raw.priceBeforeTax9 != null || raw.priceBeforeTax18 != null);
  }

  function availabilityFrom(raw, maxPlayers, customers) {
    if (raw.back9 && customers != null) {
      return { value: maxPlayers - customers, source: "customers" };
    }

    var soldOut = firstBoolean(raw, ["soldOut", "isSoldOut", "fullyBooked", "isFull", "unavailable"]);
    if (soldOut && soldOut.value) return { value: 0, source: soldOut.source };

    var bookable = firstBoolean(raw, ["bookable", "isBookable", "available", "isAvailable"]);
    if (bookable && bookable.value === false) return { value: 0, source: bookable.source };

    var direct = firstNumber(raw, [
      "spots",
      "availableSlots",
      "availableSpots",
      "availablePlayers",
      "openSpots",
      "playerSpots",
      "remainingPlayers",
      "slotsAvailable",
      "remainingSlots"
    ]);

    if (direct) return direct;

    if (Array.isArray(raw.availableSlots)) {
      return { value: raw.availableSlots.length, source: "availableSlots.length" };
    }

    if (customers != null) {
      return { value: maxPlayers - customers, source: "customers" };
    }

    var fallback = firstNumber(raw, ["available"]);
    if (fallback) return fallback;

    if (hasSearchShape(raw)) {
      return { value: maxPlayers, source: "assumed-search-row" };
    }

    return { value: 0, source: "fallback-zero" };
  }

  function summarizeRaw(raw) {
    if (!raw) return "";

    var keys = Object.keys(raw).slice(0, 24).join(", ");
    var values = [
      "availableSlots=" + debugText(raw.availableSlots),
      "spots=" + debugText(raw.spots),
      "customers=" + (Array.isArray(raw.customers) ? raw.customers.length : debugText(raw.customers)),
      "teeTimeId=" + debugText(raw.teeTimeId || raw.teeTimeID),
      "price=" + debugText(raw.priceBeforeTax ?? raw.priceBeforeTax9 ?? raw.priceBeforeTax18)
    ].join(" / ");

    return values + " / keys: " + keys;
  }

  function actionName(path) {
    return String(path).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "api_request";
  }

  function preferredImage(images) {
    if (!Array.isArray(images) || !images.length) return "";
    var hero = images.find(function (image) { return image.imageTypeID === 15 || image.imageTypeId === 15; });
    var logo = images.find(function (image) { return image.imageTypeID === 2 || image.imageTypeId === 2; });
    return (hero || logo || images[0]).imageURL || "";
  }

  function courseRank(course) {
    var text = [course.label, course.fullName, course.subCourseName].join(" ").toLowerCase();
    if (text.includes("northwest") && text.includes("inside 9")) return 0;
    if (text.includes("northwest")) return 1;
    if (text.includes("needwood") && text.includes("executive")) return 2;
    if (text.includes("needwood")) return 3;
    return 20;
  }

  function sortCourses(courses) {
    return courses.sort(function (a, b) {
      return courseRank(a) - courseRank(b) || a.label.localeCompare(b.label);
    });
  }

  function normalizeCourses(payload) {
    var source = Array.isArray(payload.companyCourses) ? payload.companyCourses : [];
    var courses = [];

    source.forEach(function (course) {
      if (!course || String(course.vanityName || "").toLowerCase() === CONFIG.vanityName) return;

      var base = withCourseCoords({
        id: Number(course.golfCourseID || course.id),
        subCourseId: null,
        label: shortCourseName(course.courseName || course.name),
        fullName: course.courseName || course.name || "Course",
        vanityName: course.vanityName || CONFIG.vanityName,
        maxPlayers: Number(course.maxBookingPlayers || course.maxPlayers || 4),
        minPlayers: Number(course.minBookingPlayers || course.minPlayers || 1),
        defaultHoles: Number(course.defaultNumberOfHoles || course.defaultHoles || 18),
        imageUrl: preferredImage(course.images),
        maxBookingDaysOut: Number(course.maxBookingDaysOut || 0)
      });

      if (base.id && base.maxBookingDaysOut > 0) {
        courses.push(base);
        (course.subCourses || []).forEach(function (sub) {
          courses.push(Object.assign({}, base, {
            subCourseId: Number(sub.subCourseID || sub.subCourseId),
            label: base.label + " " + (sub.name || "Subcourse"),
            subCourseName: sub.name || "Subcourse",
            defaultHoles: 9
          }));
        });
      }
    });

    return sortCourses(courses);
  }

  function parseTime(raw) {
    if (!raw) return "";
    var date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    var match = String(raw).match(/(\d{1,2}):(\d{2})/);
    if (!match) return String(raw);
    var hours = Number(match[1]);
    var suffix = hours >= 12 ? "PM" : "AM";
    var display = hours % 12 || 12;
    return display + ":" + match[2] + " " + suffix;
  }

  function normalizeTime(raw, course) {
    var maxPlayers = Number(raw.maxPlayers || raw.maxBookingPlayers || course.maxPlayers || 4);
    var customers = Array.isArray(raw.customers) ? raw.customers.length : null;
    var availability = availabilityFrom(raw, maxPlayers, customers);
    var available = availability.value;

    available = Math.max(0, Math.min(maxPlayers, available));

    var bookedDirect = firstNumber(raw, ["bookedPlayers", "customerCount", "playerCount", "booked", "reservedPlayers"]);
    var booked = customers != null ? customers : bookedDirect ? bookedDirect.value : maxPlayers - available;
    booked = Math.max(0, Math.min(maxPlayers, booked));

    var dateScheduled = raw.dateScheduled || raw.startTime || raw.teeTimeStart || raw.time || raw.teeTimeTime || "";
    var teeTimeId = raw.teeTimeID || raw.teeTimeId || raw.id || raw.teeTimeID;
    var holes = Number(raw.numberOfHoles || raw.holes || raw.holeCount || course.defaultHoles || 18);
    var price = holes === 9 ? raw.priceBeforeTax9 ?? raw.priceBeforeTax : raw.priceBeforeTax18 ?? raw.priceBeforeTax;
    price = price ?? raw.price ?? raw.greenFee ?? raw.fee;
    var rawSubCourseId = raw.subCourseId ?? raw.subCourseID ?? raw.teeTimeSubCourseId ?? raw.teeTimeSubCourseID ?? course.subCourseId ?? null;

    return {
      id: teeTimeId || [courseKey(course), dateScheduled, raw.teeSheetTimeID || ""].join("-"),
      teeTimeId: teeTimeId,
      courseKey: courseKey(course),
      subCourseId: rawSubCourseId,
      courseLabel: course.label,
      fullName: course.fullName,
      subCourseName: raw.subCourseName || raw.subCourseAlias || course.subCourseName || "",
      vanityName: raw.golfCourseVanityName || raw.vanityName || course.vanityName,
      timeText: parseTime(dateScheduled),
      rawTime: dateScheduled,
      available: available,
      booked: booked,
      maxPlayers: maxPlayers,
      holes: holes,
      price: price,
      availabilitySource: availability.source,
      assumedAvailability: availability.source === "assumed-search-row",
      pressure: maxPlayers ? booked / maxPlayers : 0,
      back9: !!raw.back9 || raw.startingHole === 10
    };
  }

  async function ensureRecaptcha() {
    if (window.grecaptcha && (window.grecaptcha.enterprise || window.grecaptcha).execute) return;

    await new Promise(function (resolve, reject) {
      var existing = document.querySelector("script[data-mcg-recaptcha]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = "https://www.google.com/recaptcha/enterprise.js?render=" + encodeURIComponent(CONFIG.siteKey);
      script.async = true;
      script.defer = true;
      script.dataset.mcgRecaptcha = "true";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function recaptchaToken(action) {
    await ensureRecaptcha();
    var grecaptcha = window.grecaptcha && (window.grecaptcha.enterprise || window.grecaptcha);
    if (!grecaptcha || !grecaptcha.execute) throw new Error("reCAPTCHA is unavailable on this page.");
    if (grecaptcha.ready) {
      await new Promise(function (resolve) { grecaptcha.ready(resolve); });
    }
    return grecaptcha.execute(CONFIG.siteKey, { action: action });
  }

  async function api(path, options) {
    options = options || {};
    var url = new URL(CONFIG.apiRoot + "/" + path);

    Object.entries(options.params || {}).forEach(function (entry) {
      if (entry[1] !== undefined && entry[1] !== null && entry[1] !== "") {
        url.searchParams.set(entry[0], entry[1]);
      }
    });

    var headers = new Headers(options.headers || {});
    headers.set("X-TenFore-AppId", String(CONFIG.appId));

    if (options.recaptcha) {
      var action = options.action || actionName(path);
      var token = await recaptchaToken(action);
      headers.set("X-Recaptcha-Token", token);
      headers.set("X-Recaptcha-Action", action);
    }

    var request = {
      method: options.method || "GET",
      headers: headers,
      credentials: "omit"
    };

    if (options.body) {
      headers.set("Content-Type", "application/json");
      request.body = JSON.stringify(options.body);
    }

    var response = await fetch(url.toString(), request);
    var text = await response.text();
    var body = text ? safeJSON(text) : null;

    if (!response.ok) {
      throw new Error(body && body.messageForUser ? body.messageForUser : text || response.statusText);
    }

    return body;
  }

  function safeJSON(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return { messageForUser: text };
    }
  }

  async function loadCourses() {
    if (!state.live) return DEMO_COURSES.map(withCourseCoords);
    var payload = await api("GolfCourse/GetGolfCourseByVanity", { params: { vanityName: CONFIG.vanityName } });
    if (payload.status && payload.status.successful === false) {
      throw new Error(payload.status.messageForUser || "Course lookup failed.");
    }
    return normalizeCourses(payload);
  }

  function weatherKey(course) {
    return courseKey(course) + ":" + state.date;
  }

  async function loadWeather(course) {
    var range = selectedDateInNextSeven() ? nextSevenRange() : { start: state.date, end: state.date };
    var url = new URL(CONFIG.weatherRoot);
    url.searchParams.set("latitude", course.weatherLat || COURSE_COORDS.fallback.lat);
    url.searchParams.set("longitude", course.weatherLon || COURSE_COORDS.fallback.lon);
    url.searchParams.set("hourly", "temperature_2m,precipitation_probability,precipitation,weather_code");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("precipitation_unit", "inch");
    url.searchParams.set("timezone", "America/New_York");
    url.searchParams.set("start_date", range.start);
    url.searchParams.set("end_date", range.end);

    var response = await fetch(url.toString(), { credentials: "omit" });
    if (!response.ok) throw new Error("Weather lookup failed.");

    var payload = await response.json();
    var times = payload.hourly && Array.isArray(payload.hourly.time) ? payload.hourly.time : [];
    var temps = payload.hourly && Array.isArray(payload.hourly.temperature_2m) ? payload.hourly.temperature_2m : [];
    var probabilities = payload.hourly && Array.isArray(payload.hourly.precipitation_probability) ? payload.hourly.precipitation_probability : [];
    var precipitation = payload.hourly && Array.isArray(payload.hourly.precipitation) ? payload.hourly.precipitation : [];
    var codes = payload.hourly && Array.isArray(payload.hourly.weather_code) ? payload.hourly.weather_code : [];
    var hours = {};
    var days = {};

    times.forEach(function (time, index) {
      hours[time] = {
        temp: temps[index],
        precipitationProbability: probabilities[index],
        precipitation: precipitation[index],
        weatherCode: codes[index]
      };
    });

    var daily = payload.daily || {};
    var dayTimes = Array.isArray(daily.time) ? daily.time : [];
    var dayCodes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
    var highs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
    var lows = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];

    dayTimes.forEach(function (time, index) {
      days[time] = {
        weatherCode: dayCodes[index],
        high: highs[index],
        low: lows[index]
      };
    });

    return {
      hours: hours,
      days: days,
      unit: payload.hourly_units && payload.hourly_units.temperature_2m || "°F"
    };
  }

  async function ensureWeather(course) {
    var key = weatherKey(course);
    if (state.weatherByCourseDate.has(key)) return;

    try {
      state.weatherByCourseDate.set(key, await loadWeather(course));
    } catch (error) {
      state.weatherByCourseDate.set(key, { hours: {}, days: {}, error: error.message || "Weather unavailable" });
    }
  }

  function bucketWeather(course, bucket) {
    var forecast = course ? state.weatherByCourseDate.get(weatherKey(course)) : null;
    if (!forecast || !forecast.hours) return { label: "", title: "" };

    var target = Math.round((bucket.start + 15) / 60) * 60;
    if (target >= 1440) target = 1439;

    var hours = Math.floor(target / 60);
    var key = state.date + "T" + String(hours).padStart(2, "0") + ":00";
    var hour = forecast.hours[key];

    if (!hour) return { label: "", title: "" };

    var temp = hour.temp == null ? "" : Math.round(hour.temp) + "°";
    var probability = Number(hour.precipitationProbability);
    var amount = Number(hour.precipitation);
    var code = Number(hour.weatherCode);
    var rainy = isRainyWeather(code) || amount > 0.01 || probability >= 50;
    var rainText = rainy ? "rain" : probability >= 25 ? Math.round(probability) + "%" : "dry";
    var title = [
      temp || "temperature unavailable",
      Number.isFinite(probability) ? Math.round(probability) + "% precip" : "",
      Number.isFinite(amount) ? amount + " in" : "",
      Number.isFinite(code) ? "code " + code : ""
    ].filter(Boolean).join(" · ");

    return {
      label: [temp, rainText].filter(Boolean).join(" "),
      title: title
    };
  }

  function isRainyWeather(code) {
    return code >= 51 && code <= 67 || code >= 80 && code <= 82 || code >= 95 && code <= 99;
  }

  function weatherIcon(code) {
    if (code >= 95 && code <= 99) return "⛈️";
    if (code >= 71 && code <= 77) return "❄️";
    if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return "🌧️";
    if (code >= 45 && code <= 48) return "🌫️";
    if (code >= 2 && code <= 3) return "☁️";
    return "☀️";
  }

  function dayWeather(course, value) {
    var forecast = course ? state.weatherByCourseDate.get(weatherKey(course)) : null;
    var day = forecast && forecast.days ? forecast.days[value] : null;

    if (!day) {
      return { icon: "", text: "" };
    }

    var high = day.high == null ? "" : Math.round(day.high);
    var low = day.low == null ? "" : Math.round(day.low);
    var temps = high === "" || low === "" ? "" : high + "/" + low;

    return {
      icon: weatherIcon(Number(day.weatherCode)),
      text: temps
    };
  }

  function demoTimes(course) {
    var times = DEMO_TIMES.filter(function (row) { return row[2] === course.vanityName; }).map(function (row, index) {
      return normalizeTime({
        id: row[2] + "-" + index,
        dateScheduled: state.date + "T" + row[0] + ":00",
        spots: Math.max(0, (course.maxPlayers || 4) - row[1]),
        customers: Array.from({ length: row[1] }),
        price: row[1] === 0 ? 47 : 52
      }, course);
    }).filter(function (slot) {
      return slot.timeText;
    });
    state.debugByCourse.set(requestKey(course), makeDebug(course, "preview"));
    state.debugByCourse.get(requestKey(course)).search.available = times.length;
    return times;
  }

  async function loadTimes(course) {
    var debug = makeDebug(course, state.live ? "live" : "preview");
    state.debugByCourse.set(requestKey(course), debug);

    if (!state.live) {
      await new Promise(function (resolve) { setTimeout(resolve, 120); });
      return demoTimes(course);
    }

    var searchError = null;
    var searchTimes = [];
    var v4Times = [];

    try {
      searchTimes = await loadSearchTimes(course, debug);
    } catch (error) {
      searchError = error;
      debug.search.error = error.message || "Search failed";
    }

    var v4Error = null;
    try {
      v4Times = await loadV4Times(course, debug);
    } catch (error) {
      v4Error = error;
      debug.v4.error = error.message || "V4 lookup failed";
    }

    if (searchTimes.length && v4Times.length) {
      debug.used = "TeeTimes/Search + BookingEngineV4/booking-times";
      return mergeTimes(searchTimes, v4Times);
    }

    if (v4Times.length) {
      debug.used = "BookingEngineV4/booking-times";
      return v4Times;
    }

    if (searchTimes.length) {
      debug.used = "TeeTimes/Search";
      return searchTimes;
    }

    if (searchError) throw searchError;
    if (v4Error) throw v4Error;
    return [];
  }

  function makeDebug(course, mode) {
    return {
      version: VERSION.id,
      changedAt: VERSION.changedAt,
      note: VERSION.note,
      mode: mode,
      used: "",
      date: state.date,
      courseLabel: course.label,
      courseKey: courseKey(course),
      courseId: course.id,
      subCourseId: course.subCourseId || "",
      holes: course.defaultHoles || 18,
      players: state.players,
      search: { raw: null, matched: null, available: null, error: "" },
      v4: { raw: null, matched: null, available: null, error: "" },
      sample: ""
    };
  }

  async function loadSearchTimes(course, debug) {
    var data = await loadSearchRows(course, 1);
    var available = normalizeSearchRows(data, course);

    if (debug) {
      debug.search.raw = data.length;
      debug.search.matched = available.length;
      debug.search.available = available.length;
      debug.search.thresholds = "1:" + available.length;
      debug.sample = summarizeRaw(data.find(function (raw) { return matchesCourseVariant(raw, course); }) || data[0]);
    }

    if (available.some(function (slot) { return slot.assumedAvailability; })) {
      available = await inferSearchAvailability(course, available, debug);
    }

    return available;
  }

  async function loadSearchRows(course, players) {
    var payload = await api("TeeTimes/Search", {
      recaptcha: true,
      action: "teetimes_search",
      params: {
        golfCourseIds: course.id,
        dateFrom: state.date,
        dateTo: state.date + "T23:59:59",
        players: players,
        holes: course.defaultHoles || 18
      }
    });

    return Array.isArray(payload && payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
  }

  function normalizeSearchRows(data, course) {
    return data.filter(function (raw) { return matchesCourseVariant(raw, course); }).map(function (raw) {
      return normalizeTime(raw, course);
    }).filter(function (slot) { return slot.timeText; });
  }

  async function inferSearchAvailability(course, slots, debug) {
    var presence = new Map();
    slots.forEach(function (slot) {
      presence.set(timeMergeKey(slot), 1);
    });

    for (var players = 2; players <= Math.min(4, course.maxPlayers || 4); players += 1) {
      try {
        var rows = await loadSearchRows(course, players);
        var matched = normalizeSearchRows(rows, course);
        if (debug) debug.search.thresholds += " / " + players + ":" + matched.length;

        matched.forEach(function (slot) {
          presence.set(timeMergeKey(slot), players);
        });
      } catch (error) {
        if (debug) debug.search.thresholds += " / " + players + ":err";
        break;
      }
    }

    return slots.map(function (slot) {
      if (!slot.assumedAvailability) return slot;

      var available = presence.get(timeMergeKey(slot)) || 1;
      var maxPlayers = slot.maxPlayers || course.maxPlayers || 4;
      var booked = Math.max(0, maxPlayers - available);

      return Object.assign({}, slot, {
        available: available,
        booked: booked,
        availabilitySource: "search-player-thresholds",
        assumedAvailability: false,
        pressure: maxPlayers ? booked / maxPlayers : 0
      });
    });
  }

  function matchesCourseVariant(raw, course) {
    var rawSubCourse = String(raw.subCourseName || raw.subCourse || raw.teeTimeSubCourseName || "").toLowerCase();
    var wantedSubCourse = String(course.subCourseName || "").toLowerCase();
    var rawSubCourseIdValue = raw.subCourseId ?? raw.subCourseID ?? raw.teeTimeSubCourseId ?? raw.teeTimeSubCourseID;
    var rawSubCourseId = Number(rawSubCourseIdValue);
    var hasRawSubCourseId = rawSubCourseIdValue !== undefined && rawSubCourseIdValue !== null && rawSubCourseIdValue !== "" && Number.isFinite(rawSubCourseId);
    var wantedSubCourseId = Number(course.subCourseId || 0);

    if (wantedSubCourseId) {
      if (hasRawSubCourseId) return rawSubCourseId === wantedSubCourseId;
      if (wantedSubCourse && rawSubCourse) return rawSubCourse.includes(wantedSubCourse);
      return true;
    }

    if (hasRawSubCourseId && rawSubCourseId > 0) return false;

    if (wantedSubCourse && rawSubCourse) return rawSubCourse.includes(wantedSubCourse);
    if (wantedSubCourse && !rawSubCourse) return true;
    if (!wantedSubCourse && rawSubCourse) return false;

    return true;
  }

  async function loadV4Times(course, debug) {
    var payload = await api("BookingEngineV4/booking-times", {
      method: "POST",
      recaptcha: true,
      body: {
        golfCourseId: course.id,
        subCourseId: course.subCourseId || null,
        dateFrom: state.date,
        appId: CONFIG.appId
      }
    });

    if (payload.successful === false || payload.status && payload.status.successful === false) {
      throw new Error(payload.messageForUser || payload.status && payload.status.messageForUser || "Tee-time lookup failed.");
    }

    var data = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
    var matched = data.filter(function (raw) { return matchesCourseVariant(raw, course); });
    var available = matched.map(function (raw) { return normalizeTime(raw, course); }).filter(function (slot) { return slot.timeText; });

    if (debug) {
      debug.v4.raw = data.length;
      debug.v4.matched = matched.length;
      debug.v4.available = available.length;
    }

    return available;
  }

  function mergeTimes(searchTimes, v4Times) {
    var byKey = new Map();

    searchTimes.concat(v4Times).forEach(function (slot) {
      var key = timeMergeKey(slot);
      var existing = byKey.get(key);
      byKey.set(key, existing ? mergeSlot(existing, slot) : slot);
    });

    return Array.from(byKey.values());
  }

  function timeMergeKey(slot) {
    if (slot.teeTimeId) return "id:" + slot.teeTimeId;
    return ["time", slot.courseKey, slot.subCourseId || "", slotMinutes(slot), slot.back9 ? "back" : "front"].join(":");
  }

  function hasConcreteAvailability(slot) {
    return slot.availabilitySource && slot.availabilitySource !== "assumed-search-row";
  }

  function mergeSlot(existing, next) {
    var primary = hasConcreteAvailability(next) || !hasConcreteAvailability(existing) ? next : existing;
    var secondary = primary === next ? existing : next;
    var merged = Object.assign({}, secondary, primary);

    merged.id = primary.id || secondary.id;
    merged.teeTimeId = primary.teeTimeId || secondary.teeTimeId;
    merged.subCourseId = primary.subCourseId || secondary.subCourseId;
    merged.vanityName = primary.vanityName || secondary.vanityName;
    merged.timeText = primary.timeText || secondary.timeText;
    merged.rawTime = primary.rawTime || secondary.rawTime;
    merged.price = primary.price ?? secondary.price;
    merged.holes = primary.holes || secondary.holes;

    return merged;
  }

  function sortedTimes(times) {
    var list = times.slice();
    list.sort(compareSlots);
    return list;
  }

  function compareSlots(a, b) {
    if (state.sort === "score") return slotPressureSort(a) - slotPressureSort(b) || a.booked - b.booked || b.available - a.available || compareSlotTimes(a, b);
    return compareSlotTimes(a, b);
  }

  function compareSlotTimes(a, b) {
    return slotMinutes(a) - slotMinutes(b) || String(a.rawTime).localeCompare(String(b.rawTime));
  }

  function slotPressure(slot) {
    if (slot.inferred) return null;
    return slot.maxPlayers ? slot.booked / slot.maxPlayers : 1;
  }

  function slotPressureSort(slot) {
    var pressure = slotPressure(slot);
    return pressure == null ? 2 : pressure;
  }

  function slotMinutes(slot) {
    var date = new Date(slot.rawTime);
    if (!Number.isNaN(date.getTime())) return date.getHours() * 60 + date.getMinutes();

    var text = String(slot.timeText || slot.rawTime || "");
    var match = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return 0;

    var hours = Number(match[1]);
    var minutes = Number(match[2]);
    var suffix = (match[3] || "").toUpperCase();

    if (suffix === "PM" && hours < 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  function formatMinutes(minutes) {
    var normalized = (minutes + 1440) % 1440;
    var hours = Math.floor(normalized / 60);
    var mins = normalized % 60;
    var suffix = hours >= 12 ? "PM" : "AM";
    var displayHours = hours % 12 || 12;
    return displayHours + ":" + String(mins).padStart(2, "0") + " " + suffix;
  }

  function timeISOForMinutes(minutes) {
    var normalized = (minutes + 1440) % 1440;
    var hours = Math.floor(normalized / 60);
    var mins = normalized % 60;
    return state.date + "T" + String(hours).padStart(2, "0") + ":" + String(mins).padStart(2, "0") + ":00";
  }

  function inferredCadence(times) {
    var counts = {};
    var best = 0;
    var bestCount = 0;

    for (var index = 1; index < times.length; index += 1) {
      var diff = slotMinutes(times[index]) - slotMinutes(times[index - 1]);
      if (diff < 5 || diff > 30) continue;

      var rounded = Math.max(5, Math.round(diff / 5) * 5);
      counts[rounded] = (counts[rounded] || 0) + 1;

      if (counts[rounded] > bestCount) {
        best = rounded;
        bestCount = counts[rounded];
      }
    }

    return best || 10;
  }

  function makeInferredSlot(template, minutes) {
    return {
      id: ["gap", template.courseKey, state.date, minutes].join("-"),
      teeTimeId: null,
      courseKey: template.courseKey,
      subCourseId: template.subCourseId,
      courseLabel: template.courseLabel,
      fullName: template.fullName,
      subCourseName: template.subCourseName,
      vanityName: template.vanityName,
      timeText: formatMinutes(minutes),
      rawTime: timeISOForMinutes(minutes),
      available: 0,
      booked: 0,
      maxPlayers: 0,
      holes: template.holes,
      price: null,
      availabilitySource: "not-returned",
      assumedAvailability: false,
      pressure: null,
      back9: template.back9,
      inferred: true
    };
  }

  function withInferredMissingSlots(times) {
    var list = times.slice();
    var real = list.filter(function (slot) { return !slot.inferred && slot.timeText; }).sort(compareSlotTimes);
    if (real.length < 2) return list;

    var cadence = inferredCadence(real);
    var existing = new Set(real.map(function (slot) { return String(slotMinutes(slot)); }));
    var inferred = [];

    for (var index = 1; index < real.length; index += 1) {
      var previous = slotMinutes(real[index - 1]);
      var current = slotMinutes(real[index]);
      var gap = current - previous;

      if (gap <= cadence || gap > 90) continue;

      for (var minutes = previous + cadence; minutes < current; minutes += cadence) {
        if (existing.has(String(minutes))) continue;
        existing.add(String(minutes));
        inferred.push(makeInferredSlot(real[index - 1], minutes));
      }
    }

    return list.concat(inferred);
  }

  function priceNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;

    var parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatPrice(value) {
    var price = priceNumber(value);
    if (price === null) return "";

    var rounded = Math.round(price * 100) / 100;
    return "$" + (Math.abs(rounded % 1) < 0.005 ? String(Math.round(rounded)) : rounded.toFixed(2));
  }

  function bucketPrice(bucket) {
    var prices = bucket.times.map(function (slot) { return priceNumber(slot.price); }).filter(function (price) { return price !== null; });
    if (!prices.length) return "";

    var min = Math.min.apply(Math, prices);
    var max = Math.max.apply(Math, prices);
    if (Math.abs(max - min) < 0.005) return formatPrice(min);
    return formatPrice(min) + "-" + formatPrice(max);
  }

  function bucketTimes(times) {
    var buckets = new Map();

    times.forEach(function (slot) {
      var start = Math.floor(slotMinutes(slot) / 30) * 30;
      var key = String(start);
      var bucket = buckets.get(key);

      if (!bucket) {
        bucket = {
          start: start,
          label: formatMinutes(start) + "-" + formatMinutes(start + 30),
          times: [],
          booked: 0,
          open: 0,
          capacity: 0,
          assumed: true
        };
        buckets.set(key, bucket);
      }

      bucket.times.push(slot);
      if (slot.inferred) {
        bucket.hasInferred = true;
        return;
      }

      bucket.booked += slot.booked;
      bucket.open += slot.available;
      bucket.capacity += slot.maxPlayers;
      bucket.assumed = bucket.assumed && slot.assumedAvailability;
    });

    var groups = Array.from(buckets.values());
    groups.forEach(function (bucket) {
      bucket.times.sort(compareSlotTimes);
      bucket.assumed = bucket.capacity > 0 && bucket.assumed;
      bucket.pressure = bucket.capacity ? bucket.booked / bucket.capacity : null;
      bucket.price = bucketPrice(bucket);
    });

    groups.sort(function (a, b) {
      if (state.sort === "score") return bucketPressureSort(a) - bucketPressureSort(b) || a.booked - b.booked || b.open - a.open || a.start - b.start;
      return a.start - b.start;
    });

    return groups;
  }

  function bucketPressureSort(bucket) {
    return bucket.pressure == null ? 2 : bucket.pressure;
  }

  function selectedCourse() {
    return state.courses.find(function (course) { return courseKey(course) === state.selectedKey; }) || state.courses[0];
  }

  function selectedTimes() {
    var course = selectedCourse();
    return course ? state.timesByCourse.get(requestKey(course)) || [] : [];
  }

  function summary(times) {
    var openSlots = times.length;
    var zeroBooked = times.filter(function (slot) { return slot.booked === 0; }).length;
    var totalOpen = times.reduce(function (sum, slot) { return sum + slot.available; }, 0);
    var avgBooked = times.length ? times.reduce(function (sum, slot) { return sum + slot.booked; }, 0) / times.length : 0;
    return { openSlots: openSlots, zeroBooked: zeroBooked, totalOpen: totalOpen, avgBooked: avgBooked };
  }

  function render() {
    var course = selectedCourse();
    var times = sortedTimes(withInferredMissingSlots(selectedTimes()));

    state.shadow.innerHTML = [
      "<style>", STYLE, "</style>",
      '<div class="mcg-app"><div class="mcg-shell"><div class="mcg-panel">',
      renderHeader(course),
      '<div class="mcg-body">',
      renderSidebar(),
      '<main class="mcg-main">',
      renderStatus(),
      renderTimes(course, times),
      "</main></div></div></div></div>"
    ].join("");

    bindEvents();
  }

  function renderHeader(course) {
    return [
      '<header class="mcg-header">',
      '<div class="mcg-title-row">',
      '<div class="mcg-mark">MCG</div>',
      '<div><h1 class="mcg-title">Tee-time pressure</h1>',
      '<div class="mcg-subtitle">', escapeHTML(course ? course.fullName : "MCG Golf"), state.live ? " live availability" : " preview data", "</div></div>",
      "</div>",
      '<div class="mcg-controls">',
      renderWeekdayButtons(),
      renderPlayerControl(),
      renderSortButtons(),
      '<button class="mcg-button" data-action="refresh"', state.loading ? " disabled" : "", ">", state.loading ? "Loading" : "Refresh", "</button>",
      state.live ? '<button class="mcg-button secondary" data-action="close">Exit</button>' : "",
      "</div></header>"
    ].join("");
  }

  function renderWeekdayButtons() {
    var course = selectedCourse();
    var customValue = state.draftDate || state.date;
    return [
      '<div class="mcg-weekdays">',
      nextSevenChoices().map(function (choice) {
        var weather = dayWeather(course, choice.value);
        return [
          '<button type="button" class="mcg-chip mcg-day-chip', choice.value === state.date ? " active" : "", '" data-quick-date="', escapeHTML(choice.value), '">',
          '<span class="mcg-day-name">', escapeHTML(choice.label), " ", escapeHTML(choice.shortDate), "</span>",
          '<span class="mcg-day-weather">',
          weather.icon ? '<span class="mcg-weather-icon">' + escapeHTML(weather.icon) + "</span>" : "",
          escapeHTML(weather.text),
          "</span>",
          "</button>"
        ].join("");
      }).join(""),
      '<button type="button" class="mcg-chip', selectedDateInNextSeven() ? "" : " active", '" data-action="custom-date">Date</button>',
      state.showCustomDate ? [
        '<span class="mcg-date-custom">',
        '<input class="mcg-input mcg-custom-date" data-action="date-draft" type="date" value="' + escapeHTML(customValue) + '">',
        '<button type="button" class="mcg-chip mcg-date-apply" data-action="apply-date">Go</button>',
        "</span>"
      ].join("") : "",
      "</div>"
    ].join("");
  }

  function renderSortButtons() {
    return [
      '<div class="mcg-sort-toggle" role="group" aria-label="Sort">',
      '<button type="button" class="mcg-toggle', state.sort === "time" ? " active" : "", '" data-sort-mode="time">Time</button>',
      '<button type="button" class="mcg-toggle', state.sort === "score" ? " active" : "", '" data-sort-mode="score">Score</button>',
      "</div>"
    ].join("");
  }

  function renderPlayerControl() {
    return [
      '<label class="mcg-player-control" title="Players">',
      '<span>Players</span>',
      '<input class="mcg-player-input" data-action="players" type="number" inputmode="numeric" min="1" max="4" step="1" value="', escapeHTML(state.players), '" aria-label="Players">',
      "</label>"
    ].join("");
  }

  function renderSidebar() {
    return [
      '<aside class="mcg-sidebar">',
      '<div class="mcg-sidebar-title">Courses</div>',
      '<div class="mcg-course-list">',
      state.courses.map(renderCourseButton).join(""),
      "</div></aside>"
    ].join("");
  }

  function renderCourseButton(course) {
    var key = courseKey(course);
    var loadedKey = requestKey(course);
    var count = state.timesByCourse.has(loadedKey) ? state.timesByCourse.get(loadedKey).length : "";
    var img = course.imageUrl ? '<img src="' + escapeHTML(course.imageUrl) + '" alt="">' : '<div class="mcg-course-fallback">' + escapeHTML(course.label.slice(0, 2).toUpperCase()) + "</div>";
    return [
      '<button class="mcg-course', key === state.selectedKey ? " active" : "", '" data-course="', escapeHTML(key), '">',
      img,
      '<span><span class="mcg-course-name">', escapeHTML(course.label), '</span>',
      '<span class="mcg-course-meta">', escapeHTML(course.subCourseName || (course.defaultHoles + " holes")), '</span></span>',
      '<span class="mcg-count">', escapeHTML(count), "</span>",
      "</button>"
    ].join("");
  }

  function renderStatus() {
    var content = "";
    if (state.loading) {
      content = '<span class="mcg-spinner"></span><span>Loading tee times...</span>';
    } else if (state.error) {
      content = '<span>' + escapeHTML(state.error) + "</span>";
    } else if (!state.live) {
      content = "<span>Preview mode. Live calls run from fox.tenfore.golf because TenFore requires a reCAPTCHA token for that domain.</span>";
    }
    return '<div class="mcg-status' + (content ? " show" : "") + '">' + content + "</div>";
  }

  function renderStats(stats) {
    return [
      '<section class="mcg-summary">',
      renderStat("Available times", stats.openSlots),
      renderStat("Zero booked", stats.zeroBooked),
      renderStat("Open player spots", stats.totalOpen),
      renderStat("Avg booked", stats.avgBooked.toFixed(1)),
      "</section>"
    ].join("");
  }

  function renderStat(label, value) {
    return '<div class="mcg-stat"><div class="mcg-stat-label">' + escapeHTML(label) + '</div><div class="mcg-stat-value">' + escapeHTML(value) + "</div></div>";
  }

  function renderTimes(course, times) {
    var title = course ? course.label : "Course";
    var cards = times.length ? bucketTimes(times).map(function (bucket) { return renderBucket(bucket, course); }).join("") : renderEmpty(course);
    return [
      '<section>',
      '<div class="mcg-section-head"><div>',
      '<div class="mcg-section-title">', escapeHTML(title), "</div>",
      '<div class="mcg-section-note">Tap a time window to expand.</div>',
      "</div></div>",
      '<div class="mcg-times">', cards, "</div>",
      "</section>"
    ].join("");
  }

  function renderBucket(bucket, course) {
    var best = bucket.capacity > 0 && bucket.booked === 0;
    var key = [state.selectedKey, state.date, bucket.start].join(":");
    var expanded = state.expandedBuckets.has(key);
    var assumed = bucket.assumed ? "*" : "";
    var weather = bucketWeather(course, bucket);

    return [
      '<section class="mcg-bucket', best ? " best" : "", expanded ? " expanded" : "", '">',
      '<button type="button" class="mcg-bucket-head" data-bucket="', escapeHTML(key), '" aria-expanded="', expanded ? "true" : "false", '">',
      '<div class="mcg-bucket-title"><span>', escapeHTML(bucket.label), "</span>", bucket.price ? '<span class="mcg-bucket-price">' + escapeHTML(bucket.price) + "</span>" : "", "</div>",
      '<div class="mcg-temp" title="', escapeHTML(weather.title || "hourly weather"), '">', escapeHTML(weather.label), "</div>",
      renderFill(bucket.booked, bucket.capacity, bucket.pressure, assumed, ""),
      '<div class="mcg-chevron">›</div>',
      "</button>",
      expanded ? [
      '<div class="mcg-bucket-rows">',
      bucket.times.map(renderTimeCard).join(""),
      "</div></section>"
      ].join("") : "</section>"
    ].join("");
  }

  function renderEmpty(course) {
    var debug = course ? state.debugByCourse.get(requestKey(course)) : null;
    var details = "";

    if (debug) {
      details = [
        '<div class="mcg-debug">',
        escapeHTML(debug.version), " · ", escapeHTML(debug.changedAt), "<br>",
        "Search raw ", escapeHTML(debugText(debug.search.raw)), " / matched ", escapeHTML(debugText(debug.search.matched)), " / available ", escapeHTML(debugText(debug.search.available)),
        debug.search.thresholds ? "<br>Search thresholds " + escapeHTML(debug.search.thresholds) : "",
        debug.search.error ? "<br>Search error: " + escapeHTML(debug.search.error) : "",
        "<br>V4 raw ", escapeHTML(debugText(debug.v4.raw)), " / matched ", escapeHTML(debugText(debug.v4.matched)), " / available ", escapeHTML(debugText(debug.v4.available)),
        debug.v4.error ? "<br>V4 error: " + escapeHTML(debug.v4.error) : "",
        "<br>Course ", escapeHTML(debug.courseId), debug.subCourseId ? " / subcourse " + escapeHTML(debug.subCourseId) : "", " / ", escapeHTML(debug.holes), " holes / ", escapeHTML(debug.players), " players",
        debug.sample ? "<br>Sample " + escapeHTML(debug.sample) : "",
        "</div>"
      ].join("");
    }

    return [
      '<div class="mcg-empty"><div class="mcg-empty-inner">',
      '<div class="mcg-empty-title">TenFore returned no tee times for this course and date.</div>',
      details,
      "</div></div>"
    ].join("");
  }

  function renderTimeCard(slot) {
    if (slot.inferred) {
      return [
        '<article class="mcg-time inferred" title="TenFore did not return this tee time; it may be full, blocked, skipped, or not offered.">',
        '<div class="mcg-time-clock">', escapeHTML(slot.timeText), '</div>',
        '<div class="mcg-price"></div>',
        renderFill(slot.booked, slot.maxPlayers, null, "", " mcg-time-fill"),
        '<span class="mcg-micro">-</span>',
        "</article>"
      ].join("");
    }

    var canBook = slot.available >= state.players;
    var bookUrl = canBook ? bookingUrl(slot) : "";
    var source = slot.assumedAvailability ? "*" : "";
    var unbookableLabel = slot.available <= 0 ? "Full" : slot.available + " left";

    return [
      '<article class="mcg-time', canBook ? "" : " unbookable", '">',
      '<div class="mcg-time-clock">', escapeHTML(slot.timeText), '</div>',
      '<div class="mcg-price">', escapeHTML(formatPrice(slot.price)), "</div>",
      renderFill(slot.booked, slot.maxPlayers, slotPressure(slot), source, " mcg-time-fill"),
      bookUrl ? '<a class="mcg-link" href="' + escapeHTML(bookUrl) + '" data-book-slot="' + escapeHTML(slot.id) + '">Book</a>' : '<span class="mcg-micro" title="' + escapeHTML("Only " + slot.available + " open") + '">' + escapeHTML(unbookableLabel) + "</span>",
      "</article>"
    ].join("");
  }

  function renderFill(booked, capacity, pressure, suffix, extraClass) {
    if (pressure == null || !capacity) {
      return [
        '<div class="mcg-fill unknown', escapeHTML(extraClass || ""), '" title="Not returned by TenFore">',
        '<span class="mcg-fill-dot"></span>',
        '<strong>--</strong>',
        "</div>"
      ].join("");
    }

    var label = booked + "/" + capacity + (suffix || "");
    return [
      '<div class="mcg-fill ', escapeHTML(fillClass(pressure)), escapeHTML(extraClass || ""), '" title="', escapeHTML(label), ' booked">',
      '<span class="mcg-fill-dot"></span>',
      '<strong>', escapeHTML(label), "</strong>",
      "</div>"
    ].join("");
  }

  function fillClass(pressure) {
    if (pressure == null) return "unknown";
    if (pressure >= 0.7) return "high";
    if (pressure >= 0.35) return "mid";
    return "low";
  }

  function bookingUrl(slot) {
    if (!slot.teeTimeId) return "";

    var url = new URL("/tee-time/" + encodeURIComponent(slot.teeTimeId), "https://" + CONFIG.host);
    url.searchParams.set("players", String(state.players));
    url.searchParams.set("backToSearch", "true");
    return url.toString();
  }

  function bookingPath(slot) {
    var url = new URL(bookingUrl(slot));
    return url.pathname + url.search;
  }

  function selectedSlot(slotId) {
    return selectedTimes().find(function (slot) { return String(slot.id) === String(slotId); }) || null;
  }

  async function loadBookingCourse(slot) {
    var vanity = slot.vanityName || CONFIG.vanityName;
    if (state.bookingCourseByVanity.has(vanity)) return state.bookingCourseByVanity.get(vanity);

    var payload = await api("GolfCourse/GetGolfCourseByVanity", { params: { vanityName: vanity } });
    var course = payload && payload.data && (payload.data.golfCourseID || payload.data.id) ? payload.data : payload;
    if (!course || !(course.golfCourseID || course.id)) throw new Error("Could not load booking course.");

    state.bookingCourseByVanity.set(vanity, course);
    return course;
  }

  function tenForeApp() {
    var root = document.getElementById("__nuxt");
    if (root && root.__vue_app__) return root.__vue_app__;

    var nodes = document.querySelectorAll("*");
    for (var index = 0; index < nodes.length; index += 1) {
      if (nodes[index].__vue_app__) return nodes[index].__vue_app__;
    }

    return null;
  }

  function tenForePinia(app) {
    var provides = app && app._context && app._context.provides;
    if (!provides) return null;

    var keys = Reflect.ownKeys(provides);
    for (var index = 0; index < keys.length; index += 1) {
      var value = provides[keys[index]];
      if (value && value._s && value.state) return value;
    }

    return null;
  }

  function tenForeRouter(app) {
    var globalProperties = app && app._context && app._context.config && app._context.config.globalProperties;
    if (globalProperties && globalProperties.$router && typeof globalProperties.$router.push === "function") return globalProperties.$router;

    var provides = app && app._context && app._context.provides;
    if (!provides) return null;

    var keys = Reflect.ownKeys(provides);
    for (var index = 0; index < keys.length; index += 1) {
      var value = provides[keys[index]];
      if (value && typeof value.push === "function" && value.currentRoute) return value;
    }

    return null;
  }

  async function primeTenForeCourse(slot) {
    var app = tenForeApp();
    var pinia = tenForePinia(app);
    var store = pinia && pinia._s && pinia._s.get ? pinia._s.get("mainStore") : null;
    if (!store || typeof store.setGolfCourse !== "function") return { app: app, primed: false };

    var course = await loadBookingCourse(slot);
    store.setGolfCourse(course);

    if (slot.subCourseId && typeof store.setSubCourseId === "function") {
      store.setSubCourseId(slot.subCourseId);
    }

    return { app: app, primed: true };
  }

  async function bookSlot(slotId) {
    var slot = selectedSlot(slotId);
    if (!slot || slot.available < state.players) return;

    var url = bookingUrl(slot);
    var path = bookingPath(slot);

    if (state.live) {
      try {
        var context = await primeTenForeCourse(slot);
        var router = tenForeRouter(context.app || tenForeApp());
        if (router) {
          window.__mcgTeePressureCleanup();
          await router.push(path);
          return;
        }
      } catch (error) {
        console.warn("MCG pressure booking handoff failed; using direct URL.", error);
      }
    }

    window.__mcgTeePressureCleanup();
    window.location.assign(url);
  }

  async function setSelectedDate(value) {
    state.date = isISODate(value) ? value : todayISO();
    state.draftDate = state.date;
    state.showCustomDate = false;
    state.timesByCourse.clear();
    state.debugByCourse.clear();
    state.weatherByCourseDate.clear();
    state.expandedBuckets.clear();
    await ensureSelectedTimes();
  }

  async function setPlayers(value) {
    var next = clampPlayers(value);
    if (state.players === next) {
      render();
      return;
    }

    persistPlayers(next);
    render();
  }

  function bindEvents() {
    state.shadow.querySelectorAll("[data-quick-date]").forEach(function (button) {
      button.addEventListener("click", async function () {
        await setSelectedDate(button.dataset.quickDate);
      });
    });

    state.shadow.querySelectorAll("[data-sort-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        persistSort(button.dataset.sortMode);
        render();
      });
    });

    var customDate = state.shadow.querySelector('[data-action="custom-date"]');
    if (customDate) {
      customDate.addEventListener("click", function () {
        state.showCustomDate = !state.showCustomDate;
        state.draftDate = state.date;
        render();
        if (state.showCustomDate) focusCustomDate();
      });
    }

    var players = state.shadow.querySelector('[data-action="players"]');
    if (players) {
      players.addEventListener("change", async function () {
        await setPlayers(players.value);
      });
      players.addEventListener("keydown", function (event) {
        if (event.key === "Enter") players.blur();
      });
    }

    state.shadow.querySelectorAll("[data-bucket]").forEach(function (button) {
      button.addEventListener("click", function () {
        var key = button.dataset.bucket;
        if (state.expandedBuckets.has(key)) {
          state.expandedBuckets.delete(key);
        } else {
          state.expandedBuckets.add(key);
        }
        render();
      });
    });

    state.shadow.querySelectorAll("[data-book-slot]").forEach(function (link) {
      link.addEventListener("click", async function (event) {
        event.preventDefault();
        await bookSlot(link.dataset.bookSlot);
      });
    });

    state.shadow.querySelectorAll("[data-course]").forEach(function (button) {
      button.addEventListener("click", async function () {
        state.selectedKey = button.dataset.course;
        await ensureSelectedTimes();
      });
    });

    var dateDraft = state.shadow.querySelector('[data-action="date-draft"]');
    if (dateDraft) {
      dateDraft.addEventListener("input", function () {
        state.draftDate = dateDraft.value;
      });
      dateDraft.addEventListener("change", function () {
        state.draftDate = dateDraft.value;
      });
      dateDraft.addEventListener("keydown", async function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          await applyDraftDate();
        }
        if (event.key === "Escape") {
          state.showCustomDate = false;
          state.draftDate = state.date;
          render();
        }
      });
    }

    var applyDate = state.shadow.querySelector('[data-action="apply-date"]');
    if (applyDate) {
      applyDate.addEventListener("click", applyDraftDate);
    }

    var sort = state.shadow.querySelector('[data-action="sort"]');
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value;
        render();
      });
    }

    var refresh = state.shadow.querySelector('[data-action="refresh"]');
    if (refresh) {
      refresh.addEventListener("click", async function () {
        var course = selectedCourse();
        if (course) state.timesByCourse.delete(requestKey(course));
        if (course) state.debugByCourse.delete(requestKey(course));
        if (course) state.weatherByCourseDate.delete(weatherKey(course));
        await ensureSelectedTimes();
      });
    }

    var close = state.shadow.querySelector('[data-action="close"]');
    if (close) close.addEventListener("click", window.__mcgTeePressureCleanup);
  }

  async function ensureSelectedTimes() {
    var course = selectedCourse();
    if (!course) return render();
    var key = requestKey(course);
    if (state.timesByCourse.has(key)) {
      if (!state.weatherByCourseDate.has(weatherKey(course))) await ensureWeather(course);
      return render();
    }

    state.loading = true;
    state.error = "";
    render();

    try {
      var weather = ensureWeather(course);
      state.timesByCourse.set(key, await loadTimes(course));
      await weather;
    } catch (error) {
      state.error = error.message || "Could not load tee times.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function applyDraftDate() {
    var input = state.shadow && state.shadow.querySelector('[data-action="date-draft"]');
    var value = input && input.value ? input.value : state.draftDate;
    if (!isISODate(value)) return;
    await setSelectedDate(value);
  }

  async function boot() {
    mount();
    state.loading = true;
    render();

    try {
      state.courses = await loadCourses();
      if (!state.courses.length) throw new Error("No MCG courses were returned.");
      var northwestInside = state.courses.find(function (course) { return /northwest/i.test(course.fullName) && /inside 9/i.test(course.subCourseName || course.label); });
      state.selectedKey = courseKey(northwestInside || state.courses[0]);
    } catch (error) {
      state.error = error.message || "Could not load courses.";
      state.courses = DEMO_COURSES;
      state.selectedKey = courseKey(state.courses[0]);
    } finally {
      state.loading = false;
      await ensureSelectedTimes();
    }
  }

  function mount() {
    var preview = document.getElementById("mcg-preview-root");
    if (preview) {
      state.root = preview;
      state.shadow = preview.shadowRoot || (preview.attachShadow ? preview.attachShadow({ mode: "open" }) : preview);
      return;
    }

    var host = document.createElement("div");
    host.id = "mcg-tee-pressure-root";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#f5f7f2;";
    document.body.appendChild(host);
    state.root = host;
    state.shadow = host.attachShadow({ mode: "open" });
  }

  boot();
})();
