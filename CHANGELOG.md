# Changelog

## 2025-03-05

### Bug Fixes

- **Preload script crash**: Electron's sandboxed preload cannot resolve sibling modules via `require()`. Inlined IPC channel constants directly in `preload.ts` instead of importing from `shared/types`. This was preventing the entire renderer from loading (`window.pixelAgents` was undefined).
- **React 19 useRef type error**: `useRef(() => new PMCharacter(...))` is not valid in React 19 (function initializers aren't supported for useRef). Changed to `useRef(null!)` with eager initialization pattern.
- **Unused imports**: Removed unused `CHARACTER_FRAME_WIDTH` / `CHARACTER_FRAME_HEIGHT` imports in `Character.ts` that caused `noUnusedLocals` build errors.
- **DevTools auto-open**: Changed from inline DevTools (which consumed half the window) to detached mode during development.
- **Claude Code hooks settings format**: Updated `~/.claude/settings.json` to use the new hooks schema format (`matcher` + `hooks` array wrapper). Old format caused settings file to be skipped entirely.
- **Hook script path**: Fixed incorrect path in hooks config (`pixel-agents-expanded/` -> `WebstormProjects/pixel-agents-expanded/`).

### Features

- **Asset pack switcher in Settings**: Added "Asset pack" row to Settings panel showing current tier (Free/Premium) with a "Change Asset Pack" button that reopens the FirstLaunch asset picker.
