# Usage Limits

A Claude Code mod that shows the git branch, context usage and your plan's usage limits as one status line under the prompt:

```text
⎇ main  │  Context ██░░░░░░░░ 21% 42k/200k  │  Session ██░░░░░░░░ 16% ↻2h 19m  │  Weekly ████████░░ 83% ↻2d 4h
```

- **Branch**: the checked-out git branch (short commit when detached); hidden outside a repo
- **Context**: how full the context window is, with tokens used / window size
- **Session**: the `five_hour` rate-limit window
- **Weekly**: the `seven_day` window (and a gateway `spend_limit`, if one is reported)

The figures come from `$.session.usage()` and the `session.measure` event, which are the same figures the built-in status line has. They update after each turn, or when a unit moves. The branch and the reset countdown also refresh once a minute.

Limits:
- Context and limits stay empty until the first response of the session reports them.
- The limit windows are absent with API-key billing, where there are no rate-limit windows.
- The status line is plain text, so it carries no colors.

Try it (from the repo root): `claude --plugin-dir ./usage-limits`
Install: `claude plugin marketplace add https://github.com/falconeri/claude-usage-limit.git` then `claude plugin install usage-limits@local-mods --scope user`
