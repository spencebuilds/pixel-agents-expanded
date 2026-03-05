# Pixel Agents — Claude Code Skill

Pixel Agents visualizes your Claude Code sessions as animated pixel art characters in a virtual office. Each active Claude Code session becomes a character that walks around, sits at desks, and animates based on what tools are being used.

## Setup

Pixel Agents uses Claude Code hooks to receive real-time events from your sessions. The hooks forward lifecycle events (session start, tool use, stop) to the Pixel Agents Electron app via a local WebSocket connection.

### Automatic installation

Run from the pixel-agents-expanded project directory:

```bash
node scripts/setup-hooks.js
```

This adds hooks to your `~/.claude/settings.json` that forward events to the Pixel Agents app.

To remove the hooks:

```bash
node scripts/setup-hooks.js --uninstall
```

### Manual installation

Add the following to your `~/.claude/settings.json` (or project-level `.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "node \"/path/to/pixel-agents-expanded/scripts/hook-notify.js\" sessionStart"
      }
    ],
    "PreToolUse": [
      {
        "command": "node \"/path/to/pixel-agents-expanded/scripts/hook-notify.js\" preToolUse"
      }
    ],
    "PostToolUse": [
      {
        "command": "node \"/path/to/pixel-agents-expanded/scripts/hook-notify.js\" postToolUse"
      }
    ],
    "Stop": [
      {
        "command": "node \"/path/to/pixel-agents-expanded/scripts/hook-notify.js\" stop"
      }
    ]
  }
}
```

Replace `/path/to/pixel-agents-expanded` with the actual path to where you cloned or installed the project.

## How it works

1. Each hook command receives event data from Claude Code on stdin as JSON
2. The `hook-notify.js` script reads the WebSocket port from `~/.pixel-agents/ws-port`
3. It connects to the Pixel Agents Electron app's local WebSocket server
4. It sends the event (session start, tool use, stop) as a typed JSON message
5. The Electron app creates/updates/removes animated characters accordingly

## Requirements

- The Pixel Agents Electron app must be running for hooks to deliver events
- If the app is not running, hooks exit silently without affecting Claude Code
- Node.js must be available in your PATH (it is if you can run Claude Code)

## Fallback detection

Even without hooks configured, Pixel Agents can detect Claude Code sessions by watching JSONL transcript files in `~/.claude/projects/`. Hooks provide faster, more accurate detection and are the recommended approach.
