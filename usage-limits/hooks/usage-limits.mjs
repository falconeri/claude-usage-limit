// Usage Limits: the plan's rate-limit windows, above the prompt.
//
// session.start: take a first reading, so the band shows before any turn
// (empty until the first response reports the windows).
// session.measure: the engine pushes $.session.usage()'s figures after each
// main-thread turn and whenever a window moves a whole point; keep the
// five_hour (current session) and seven_day (weekly) windows.
// ui.render (AbovePrompt): one line per window kind: a bar, the percent
// used and how long until it resets. A one-minute clock keeps the
// countdown fresh between turns.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

const TICK_MS = 60_000;
const BAR_WIDTH = 10;

const LABELS = {
  five_hour: "Session",
  seven_day: "Weekly",
  spend_limit: "Spend",
};

// The order windows are drawn in; unknown kinds go last.
const ORDER = ["five_hour", "seven_day", "spend_limit"];

// { kind, percentUsed, resetsAt }, as the last response reported them.
let limits = [];
let now = 0;
let ticker = null;

export function register(on) {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    limits = [];
    await takeReading($);
    startTicker($);
    return result;
  });

  on("session.measure", async ($, e, next) => {
    const result = await next(e);
    if (e.changed.includes("rateLimits")) {
      limits = sorted(e.rateLimits ?? []);
      now = await $.clock.now();
      $.ui.invalidate("ui.render");
    }
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, ($, e, next) => {
    if (e.hasSurvey || limits.length === 0) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    return band(Box, Text, e.bodyColumns ?? 80);
  });
}

async function takeReading($) {
  try {
    const { rateLimits } = await $.session.usage();
    limits = sorted(rateLimits ?? []);
    now = await $.clock.now();
    $.ui.invalidate("ui.render");
  } catch {
    // No reading; the band keeps the last one.
  }
}

// Redraws once a minute so "resets in" counts down while the session idles.
function startTicker($) {
  if (ticker) {
    ticker.cancel();
  }
  ticker = $.clock.every(TICK_MS, () => tick($));
}

async function tick($) {
  if (limits.length === 0) {
    return;
  }
  now = await $.clock.now();
  $.ui.invalidate("ui.render");
}

function sorted(rateLimits) {
  const rank = (kind) => {
    const i = ORDER.indexOf(kind);
    return i === -1 ? ORDER.length : i;
  };
  return [...rateLimits].sort((a, b) => rank(a.kind) - rank(b.kind));
}

function band(Box, Text, columns) {
  const wide = columns >= 70;
  const parts = [];
  limits.forEach((limit, i) => {
    if (i > 0) {
      parts.push(Text({ dimColor: true, children: "   │   " }));
    }
    parts.push(...windowParts(Text, limit, wide));
  });
  return Box({ flexDirection: "row", paddingX: 1, children: parts });
}

function windowParts(Text, limit, wide) {
  const percent = limit.percentUsed ?? 0;
  const color = colorFor(percent);
  const label = LABELS[limit.kind] ?? limit.kind;
  const parts = [Text({ bold: true, children: `${label} ` })];
  if (wide) {
    parts.push(Text({ color, children: bar(percent) }));
    parts.push(Text({ children: " " }));
  }
  parts.push(Text({ color, bold: true, children: `${formatPercent(percent)}%` }));
  const reset = resetsIn(limit.resetsAt);
  if (reset) {
    parts.push(Text({ dimColor: true, children: wide ? `  resets in ${reset}` : ` ↻${reset}` }));
  }
  return parts;
}

function colorFor(percent) {
  if (percent >= 90) return "red";
  if (percent >= 75) return "magenta";
  if (percent >= 50) return "yellow";
  return "green";
}

function bar(percent) {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH)));
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

function formatPercent(percent) {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

function resetsIn(resetsAt) {
  if (!resetsAt || !now) {
    return "";
  }
  const ms = Date.parse(resetsAt) - now;
  if (Number.isNaN(ms)) {
    return "";
  }
  if (ms <= 0) {
    return "now";
  }
  const minutes = Math.ceil(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
