# Usage Limits

A Claude Code mod that shows your plan's usage limits in the band above the prompt:

```text
 Session ██░░░░░░░░ 16%  resets in 2h 19m   │   Weekly ████████░░ 83%  resets in 2d 4h
```

- **Session**: the `five_hour` rate-limit window
- **Weekly**: the `seven_day` window (and a gateway `spend_limit`, if one is reported)

Colors: green under 50%, yellow 50-74%, magenta 75-89%, red 90% and over.

The figures come from `$.session.usage().rateLimits` and the `session.measure` event, which are the same figures the status line has. They update after each turn, or when a window moves a whole point. The countdown also refreshes once a minute.

Limits:
- The band stays empty until the first response of the session reports the windows.
- It shows nothing with API-key billing, where there are no rate-limit windows.
- Below 70 columns, the bars are hidden.

Try it (from the repo root): `claude --plugin-dir ./usage-limits`
Install: `claude plugin marketplace add https://github.com/falconeri/claude-usage-limit.git` then `claude plugin install usage-limits@local-mods --scope user`
