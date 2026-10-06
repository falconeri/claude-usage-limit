// Usage Limits: model, git branch, context usage and the plan's rate-limit
// windows, as one line in the band above the prompt.
//
// session.start: take a first reading, so the line shows before any turn
// (limits and context stay empty until the first response reports them).
// session.measure: the engine pushes $.session.usage()'s figures after each
// main-thread turn and whenever a unit moves; keep the context window fill and
// the five_hour (current session) and seven_day (weekly) windows.
// A one-minute clock re-reads the git branch and keeps the reset countdown
// fresh between turns.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

const TICK_MS = 60_000;
const BAR_WIDTH = 8;
const SEPARATOR = "│";

const LABELS = {
  five_hour: "5h",
  seven_day: "7d",
  spend_limit: "$",
};

// How long each window is, to place the elapsed-time marker on its bar.
const SPAN_MS = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * 24 * 3_600_000,
};

// Pace tones. A window is green while usage stays at or behind the clock, amber
// once it runs ahead, red when it runs well ahead or is nearly spent.
const TONES = {
  calm: "green",
  fast: "#d9962b",
  alert: "red",
};
const PACE_ALERT = 15;
const USED_ALERT = 90;
// Usage this low stays green early in a window, when the margin is still small.
const USED_CALM = 10;

// The order windows are drawn in; unknown kinds go last.
const ORDER = ["five_hour", "seven_day", "spend_limit"];

// { kind, percentUsed, resetsAt }, as the last response reported them.
let limits = [];
// { tokens, window, percent }, the live context window; percent is absent
// until the first response of the window.
let context = null;
let branch = "";
// The resolved model id the session runs on; "" until the engine reports one.
let model = "";
let now = 0;
let ticker = null;

export function register(on) {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    limits = [];
    context = null;
    await takeReading($);
    startTicker($);
    return result;
  });

  // The model is not part of $.session.usage(); it arrives with the settings
  // hooks' events: SessionStart names it at startup, resume and /clear, and
  // PostModelSwitch follows every /model change or automatic fallback.
  on("classic.SessionStart", async ($, e, next) => {
    if (e.model) {
      model = e.model;
      safeDraw($);
    }
    return next(e);
  });

  on("classic.PostModelSwitch", async ($, e, next) => {
    model = e.to_model;
    safeDraw($);
    return next(e);
  });

  on("session.measure", async ($, e, next) => {
    const result = await next(e);
    if (e.changed.includes("rateLimits")) {
      limits = sorted(e.rateLimits ?? []);
    }
    if (e.changed.includes("context")) {
      context = e.context ?? null;
    }
    now = await $.clock.now();
    // A turn is when the branch is most likely to have changed.
    branch = await readBranch($);
    draw($);
    return result;
  });

  // A band above the prompt rather than $.ui.status(): the host puts the
  // plugin's name in front of every status line, which costs width.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const elements = $.ui.resolve(e);
    const line = statusLine(elements);
    if (!line) {
      return next(e);
    }
    const { Box } = elements;
    // Keep what the mods after this one draw in the band.
    const rest = await next(e);
    if (!rest) {
      return line;
    }
    return Box({ flexDirection: "column", children: [line, rest] });
  });
}

async function takeReading($) {
  try {
    const usage = await $.session.usage();
    limits = sorted(usage.rateLimits ?? []);
    context = usage.context ?? null;
    now = await $.clock.now();
  } catch {
    // No reading; the line keeps the last one.
  }
  branch = await readBranch($);
  draw($);
}

// Redraws once a minute so "resets in" counts down while the session idles.
function startTicker($) {
  if (ticker) {
    ticker.cancel();
  }
  ticker = $.clock.every(TICK_MS, () => tick($));
}

async function tick($) {
  now = await $.clock.now();
  branch = await readBranch($);
  draw($);
}

// The checked-out branch, the short commit when detached, "" outside a repo.
async function readBranch($) {
  try {
    const named = await $.process.run(["git", "symbolic-ref", "--short", "-q", "HEAD"]);
    if (named.exitCode === 0 && named.stdout.trim()) {
      return named.stdout.trim();
    }
    const detached = await $.process.run(["git", "rev-parse", "--short", "HEAD"]);
    return detached.exitCode === 0 ? detached.stdout.trim() : "";
  } catch {
    return "";
  }
}

// For hooks that sit in front of the engine's own events: a failed redraw must
// not get in their way.
function safeDraw($) {
  try {
    draw($);
  } catch {
    // The next tick or turn redraws.
  }
}

function draw($) {
  $.ui.invalidate("ui.render");
}

// The line as one row of segments split by a dim bar, or undefined when there
// is nothing to show yet.
function statusLine({ Box, Text }) {
  const segments = [];
  if (model) {
    segments.push(Text({ key: "model", bold: true, color: "cyan", children: [`◆ ${modelName(model)}`] }));
  }
  if (branch) {
    segments.push(Text({ key: "branch", color: "magenta", children: [`⎇ ${branch}`] }));
  }
  if (context?.percent !== undefined) {
    segments.push(contextSegment({ Box, Text }, context));
  }
  for (const limit of limits) {
    segments.push(limitSegment({ Box, Text }, limit));
  }
  if (segments.length === 0) {
    return undefined;
  }
  const children = [];
  segments.forEach((segment, i) => {
    if (i > 0) {
      children.push(Box({ key: `sep-${i}`, paddingX: 1, children: [Text({ dimColor: true, children: [SEPARATOR] })] }));
    }
    children.push(segment);
  });
  return Box({ flexDirection: "row", flexWrap: "wrap", children });
}

// "claude-sonnet-5-5" -> "sonnet-5-5"; drops the vendor prefix, a dated
// suffix ("-20251001") and a context-size tag ("[1m]").
function modelName(id) {
  return id
    .replace(/^claude-/, "")
    .replace(/\[.*\]$/, "")
    .replace(/-\d{8}$/, "");
}

function sorted(rateLimits) {
  const rank = (kind) => {
    const i = ORDER.indexOf(kind);
    return i === -1 ? ORDER.length : i;
  };
  return [...rateLimits].sort((a, b) => rank(a.kind) - rank(b.kind));
}

// Context has no clock, so its tone follows the fill alone.
function contextSegment({ Box, Text }, { tokens, window, percent }) {
  const tone = percent >= 80 ? "alert" : percent >= 50 ? "fast" : "calm";
  const used = tokens === undefined ? "" : ` · ${formatTokens(tokens)}/${formatTokens(window)}`;
  return Box({
    key: "ctx",
    flexDirection: "row",
    children: [
      Text({ key: "label", children: ["ctx "] }),
      bar(Text, percent, percent, tone),
      Text({ key: "value", bold: true, children: [` ${formatPercent(percent)}%`] }),
      Text({ key: "detail", dimColor: true, children: [used] }),
    ],
  });
}

function limitSegment({ Box, Text }, limit) {
  const percent = limit.percentUsed ?? 0;
  const label = LABELS[limit.kind] ?? limit.kind;
  const left = limit.resetsAt && now ? Date.parse(limit.resetsAt) - now : NaN;
  const span = SPAN_MS[limit.kind];
  const elapsed = span && Number.isFinite(left) ? clamp(100 - (Math.max(0, left) / span) * 100) : percent;
  const tone = toneOf(percent, elapsed);
  const reset = resetsIn(limit.resetsAt);
  return Box({
    key: `limit-${limit.kind}`,
    flexDirection: "row",
    children: [
      Text({ key: "label", children: [`${label} `] }),
      bar(Text, percent, elapsed, tone),
      Text({ key: "value", bold: true, color: TONES[tone], children: [` ${formatPercent(percent)}%`] }),
      Text({ key: "detail", dimColor: true, children: [reset ? ` · ${reset}` : ""] }),
    ],
  });
}

// Green while usage stays at or behind the clock, amber once it runs ahead, red
// when it runs well ahead or the window is nearly spent.
function toneOf(used, elapsed) {
  if (used >= USED_ALERT) return "alert";
  const pace = used - elapsed;
  if (pace > PACE_ALERT) return "alert";
  if (pace > 0 && used >= USED_CALM) return "fast";
  return "calm";
}

// Thin cells side by side: ━ up to the share used; ╍ for the gap to the time
// elapsed, in the tone when usage runs ahead and grey when there is margin; ─ for
// the rest of the window.
function bar(Text, used, elapsed, tone) {
  const color = TONES[tone];
  const usedCells = Math.round((clamp(used) / 100) * BAR_WIDTH);
  const timeCells = Math.round((clamp(elapsed) / 100) * BAR_WIDTH);
  const cells = [];
  for (let i = 0; i < BAR_WIDTH; i++) {
    const key = `c${i}`;
    if (i < Math.min(usedCells, timeCells)) cells.push(Text({ key, color, children: ["━"] }));
    else if (i < usedCells) cells.push(Text({ key, color, children: ["╍"] }));
    else if (i < timeCells) cells.push(Text({ key, dimColor: true, children: ["╍"] }));
    else cells.push(Text({ key, dimColor: true, children: ["─"] }));
  }
  // One Text per cell, nested so the cells stay on one line with no gaps.
  return Text({ key: "bar", children: cells });
}

function clamp(percent) {
  return Math.max(0, Math.min(100, percent));
}

function formatPercent(percent) {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
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
  // Tight forms: 4d2h, 2h28, 45m.
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, "0")}`;
  return `${mins}m`;
}
