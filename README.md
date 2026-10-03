# local-mods

Personal Claude Code mods, published as a plugin marketplace named `local-mods`.

## Mods

| Mod | What it does |
| --- | --- |
| [usage-limits](usage-limits/README.md) | Shows the 5-hour session and weekly plan usage limits in the band above the prompt. |

## Install

On any machine with Claude Code, add the marketplace, then install the mod:

```bash
claude plugin marketplace add https://github.com/falconeri/claude-usage-limit.git
claude plugin install usage-limits@local-mods --scope user
```

`--scope user` installs it for every project on that machine. Restart Claude Code (or start a new session) afterwards.

To update later:

```bash
claude plugin marketplace update local-mods
```

To remove it:

```bash
claude plugin uninstall usage-limits@local-mods
claude plugin marketplace remove local-mods
```

## Try it without installing

Clone the repo, then from its root:

```bash
claude --plugin-dir ./usage-limits
```

## Layout

```text
.claude-plugin/marketplace.json   marketplace manifest (name: local-mods)
usage-limits/                     the usage-limits plugin
  .claude-plugin/plugin.json
  hooks/
```
