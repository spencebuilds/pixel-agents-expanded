# Pixel Agents Expanded

Pixel art office where your Claude Code agents come to life as animated characters -- standalone Electron app that works with ANY editor or terminal.

## Features

- **Animated pixel art characters** for each active Claude Code session
- **Real-time detection** via Claude Code hooks (primary) or JSONL transcript watching (fallback)
- **Context-aware animations** -- characters walk to desks, sit down, type, and read, with animations matching actual tool usage
- **PM character (Spencer)** wanders around the office with periodic speech bubbles
- **Editor-agnostic** -- works with WebStorm, PyCharm, IntelliJ, VS Code, terminal, or any editor
- **System tray integration** with show/hide toggle
- **Free CC0 sprites** bundled out of the box, with an optional premium tileset

## Quick Start

```bash
# Clone and install
git clone https://github.com/spencebuilds/pixel-agents-expanded.git
cd pixel-agents-expanded
npm install

# Run in development
npm run dev

# (Optional) Setup Claude Code hooks for real-time detection
npm run setup-hooks
```

## Agent Detection

Pixel Agents uses two methods to detect active Claude Code sessions:

### Method 1: Claude Code Hooks (Primary)

Claude Code hooks provide real-time, low-latency detection of agent activity including which tools are being used. To set up hooks:

```bash
npm run setup-hooks
```

This configures Claude Code to send lifecycle and tool-use events to the Pixel Agents WebSocket server (port 17245). Hook events include session start/stop, tool invocations, and completions.

To remove hooks:

```bash
npm run setup-hooks:uninstall
```

### Method 2: JSONL Transcript Watching (Fallback)

If hooks are not configured, Pixel Agents falls back to watching Claude Code's JSONL transcript files in `~/.claude/projects/`. This method polls for changes and detects active sessions by monitoring file modifications. It works automatically with no setup required, but has slightly higher latency than hooks.

## Premium Assets

The app ships with free CC0-licensed character sprites and hand-drawn furniture. For a higher-fidelity office environment, you can optionally import the [Office Interior Tileset](https://donarg.itch.io/officetileset) by Donarg ($2 on itch.io).

After purchasing and downloading:

```bash
npm run import-tileset
```

Follow the prompts to point to your downloaded tileset image. The tileset cannot be redistributed, so each user must purchase their own copy.

## Building

```bash
# Build for distribution
npm run build:electron
```

This produces platform-specific packages (.dmg for macOS, .exe for Windows, .AppImage for Linux) via electron-builder.

## Credits

- **Original project:** [pixel-agents](https://github.com/pablodelucca/pixel-agents) by [pablodelucca](https://github.com/pablodelucca) -- the VS Code extension this app is based on
- **Character sprites:** [Metro City Free Topdown Character Pack](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack) by JIK-A-4 (CC0 license)
- **Premium tileset:** [Office Interior Tileset](https://donarg.itch.io/officetileset) by Donarg (optional, $2)
- **Built by:** [spencebuilds](https://github.com/spencebuilds)

## License

MIT
