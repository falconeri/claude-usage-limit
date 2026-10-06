# Usage Limits

A Claude Code mod that shows the model, git branch, context usage, your plan's usage limits and the prompt-cache countdown as one compact, colored line in the band above the prompt:

```text
◆ sonnet-5-5 │ ⎇ main │ ctx ━─────── 9% · 85k/1M │ 5h ━╍╍╍──── 16% · 2h28 │ 7d ━━╍───── 23% · 4d2h │ cache 52m
```

- **Model** (`◆`): the model the session runs on, shortened (`claude-sonnet-5-5` shows as `sonnet-5-5`). It follows `/model` changes and automatic fallbacks.
- **Branch** (`⎇`): the checked-out git branch (short commit when detached); hidden outside a repo.
- **ctx**: how full the context window is, with tokens used / window size. Green, amber from 50%, red from 80%.
- **5h** and **7d**: the `five_hour` and `seven_day` rate-limit windows, with the time left until they reset (a gateway `spend_limit` shows as `$`).
- **cache**: the time before the prompt cache lapses; see below.

## Reading the bars

Each bar is 8 cells wide:

- `━` is what you have used.
- `╍` is the gap between what you have used and the time elapsed in the window. It is grey while usage is behind the clock, and takes the bar's color when you are using faster than time passes.
- `─` is the rest of the window.

The 5h and 7d colors follow pace: green while usage stays at or behind the clock, amber once it runs ahead, red when it runs well ahead (more than 15 points) or passes 90%. Under 10% used stays green, so the start of a window does not flash amber.

## Cache timer

The prompt cache lasts about 1 hour after a request on a subscription within its plan limits, and 5 minutes otherwise (API key, or usage credits). The timer counts down from your last main-thread message; each message that reads the cache renews it. It is green, amber under 10 minutes, and red `expired` once it has lapsed, when the next message has to write the whole context again.

- It starts after your first message, so a new or resumed session shows no cache segment until then.
- `/compact` clears it, since compaction rewrites the context, until your next message.
- Subagent requests are ignored; they keep their own cache.
- The lifetime is inferred from your plan, not read from the API, so the 1 hour is an assumption. These variables override it: `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` or `1h`), `ENABLE_PROMPT_CACHING_1H`. `DISABLE_PROMPT_CACHING` hides the segment.

## How it works

The context and limit figures come from `$.session.usage()` and the `session.measure` event, the same figures the built-in status line has. They update after each turn, or when a unit moves. The branch, the reset countdowns and the cache countdown also refresh once a minute.

The model is not part of those figures. It comes from the `classic.SessionStart` (startup, resume, `/clear`) and `classic.PostModelSwitch` events.

The line is drawn in the `AbovePrompt` band, not with `$.ui.status()`, because the host puts the plugin's name in front of every status line, which costs width. The trade-off is that it sits above the prompt rather than below it.

Limits:
- Context and limits stay empty until the first response of the session reports them.
- The limit windows are absent with API-key billing, where there are no rate-limit windows. The cache timer then assumes 5 minutes.
- On a very narrow terminal the line wraps onto a second row instead of being cut off.

Try it (from the repo root): `claude --plugin-dir ./usage-limits`
Install: `claude plugin marketplace add https://github.com/falconeri/claude-usage-limit.git` then `claude plugin install usage-limits@local-mods --scope user`
