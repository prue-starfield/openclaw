---
name: session-memory
description: "Save session context to memory when /new command is issued"
homepage: https://docs.openclaw.ai/automation/hooks#session-memory
metadata:
  {
    "openclaw":
      {
        "emoji": "💾",
        "events": ["command:new"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Session Memory Hook

Automatically saves session context to your workspace memory when you issue the `/new` command.

## What It Does

When you run `/new` to start a fresh session:

1. **Finds the previous session** - Uses the pre-reset session entry to locate the correct transcript
2. **Extracts conversation excerpt** - Reads the last N user/assistant messages from the session (default: 15, configurable)
3. **Generates descriptive slug** - Uses LLM to create a meaningful filename slug based on conversation content
4. **Saves to memory** - Creates a new file at `<workspace>/memory/YYYY-MM-DD-slug.md`

## Output Format

Memory files are created with the following format:

```markdown
# Session: 2026-01-16 14:30:00 UTC

- **Session Key**: agent:main:main
- **Session ID**: abc123def456
- **Source**: telegram

## Conversation Summary

user: ...
assistant: ...
```

## Filename Examples

The LLM generates descriptive slugs based on your conversation:

- `2026-01-16-vendor-pitch.md` - Discussion about vendor evaluation
- `2026-01-16-api-design.md` - API architecture planning
- `2026-01-16-bug-fix.md` - Debugging session
- `2026-01-16-1430.md` - Fallback timestamp if slug generation fails

## Requirements

- **Config**: `workspace.dir` must be set (automatically configured during onboarding)

The hook uses your configured LLM provider to generate slugs, so it works with any provider (Anthropic, OpenAI, etc.).

## Configuration

The hook supports optional configuration:

| Option            | Type     | Default | Description                                                           |
| ----------------- | -------- | ------- | --------------------------------------------------------------------- |
| `excerptMessages` | number   | 15      | Number of user/assistant messages to include in the excerpt           |
| `includeExcerpt`  | boolean  | true    | If false, do not include the conversation excerpt section             |
| `messages`        | number   | 15      | Back-compat alias for `excerptMessages`                               |
| `llmSlug`         | boolean  | true    | If false, disable LLM-based slug generation (timestamp slug fallback) |
| `excludeExact`    | string[] | []      | Drop messages whose trimmed text matches one of these strings exactly |
| `excludePrefixes` | string[] | []      | Drop messages whose trimmed text starts with one of these prefixes    |
| `excludeRegexes`  | string[] | []      | Drop messages whose trimmed text matches any of these regex patterns  |

Example configuration:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-memory": {
          "enabled": true,
          "excerptMessages": 25,
          "includeExcerpt": true
        }
      }
    }
  }
}
```

Notes:

- The excerpt is **noise-filtered** (common automation markers, heartbeat prompts, and large untrusted metadata blocks are removed) before slicing to `excerptMessages`.
- You can add additional per-installation filtering using `excludeExact`, `excludePrefixes`, and/or `excludeRegexes`.
- In test environments, LLM calls are disabled for determinism.

## Disabling

To disable this hook:

```bash
openclaw hooks disable session-memory
```

Or remove it from your config:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-memory": { "enabled": false }
      }
    }
  }
}
```
