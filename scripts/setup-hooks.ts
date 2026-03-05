#!/usr/bin/env node
/**
 * setup-hooks.ts — Install or uninstall Claude Code hooks for Pixel Agents.
 *
 * Reads ~/.claude/settings.json, adds (or removes) hooks that forward
 * Claude Code lifecycle events to the Pixel Agents Electron app.
 *
 * Usage:
 *   npx ts-node scripts/setup-hooks.ts            # install hooks
 *   npx ts-node scripts/setup-hooks.ts --uninstall # remove hooks
 *
 * Or after compilation:
 *   node scripts/setup-hooks.js
 *   node scripts/setup-hooks.js --uninstall
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Constants ──────────────────────────────────────────────────────────────

const CLAUDE_SETTINGS_DIR = path.join(os.homedir(), ".claude");
const CLAUDE_SETTINGS_FILE = path.join(CLAUDE_SETTINGS_DIR, "settings.json");

/**
 * Marker comment embedded in hook commands so we can identify our hooks
 * when updating or uninstalling. This string MUST NOT change across versions.
 */
const HOOK_MARKER = "pixel-agents-hook";

/**
 * Absolute path to the hook-notify.js script.
 *
 * When compiled, __dirname is dist/scripts/. The actual hook-notify.js lives
 * in the project root's scripts/ directory. We resolve two levels up from
 * dist/scripts/ to reach the project root, then into scripts/.
 */
const HOOK_SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "hook-notify.js");

/**
 * The hook types we install, in the order Claude Code invokes them.
 */
const HOOK_TYPES = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "Stop",
] as const;

type HookType = (typeof HOOK_TYPES)[number];

/**
 * Map Claude Code hook types to our internal event type names.
 */
const HOOK_TYPE_MAP: Record<HookType, string> = {
  SessionStart: "sessionStart",
  PreToolUse: "preToolUse",
  PostToolUse: "postToolUse",
  Stop: "stop",
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface HookEntry {
  command: string;
  [key: string]: unknown;
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readSettings(): ClaudeSettings {
  if (!fs.existsSync(CLAUDE_SETTINGS_FILE)) {
    return {};
  }
  const raw = fs.readFileSync(CLAUDE_SETTINGS_FILE, "utf8");
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    console.error(
      `Error: ${CLAUDE_SETTINGS_FILE} contains invalid JSON. Please fix it manually.`,
    );
    process.exit(1);
  }
}

function writeSettings(settings: ClaudeSettings): void {
  if (!fs.existsSync(CLAUDE_SETTINGS_DIR)) {
    fs.mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
  }
  fs.writeFileSync(
    CLAUDE_SETTINGS_FILE,
    JSON.stringify(settings, null, 2) + "\n",
    "utf8",
  );
}

function isOurHook(entry: HookEntry): boolean {
  return entry.command.includes(HOOK_MARKER);
}

/**
 * Build the hook command for a given hook type.
 * The command pipes stdin to hook-notify.js with the appropriate type argument.
 * The marker comment is appended so we can identify our hooks later.
 */
function buildHookCommand(hookType: HookType): string {
  const eventType = HOOK_TYPE_MAP[hookType];
  // Use node to run the script; quote the path in case it contains spaces.
  // The #pixel-agents-hook marker is placed in a comment for identification.
  return `node "${HOOK_SCRIPT}" ${eventType} # ${HOOK_MARKER}`;
}

// ─── Install ────────────────────────────────────────────────────────────────

function install(): void {
  // Verify hook-notify.js exists
  if (!fs.existsSync(HOOK_SCRIPT)) {
    console.error(
      `Error: hook-notify.js not found at ${HOOK_SCRIPT}\n` +
        "Make sure you're running this from the pixel-agents-expanded project root.",
    );
    process.exit(1);
  }

  const settings = readSettings();
  if (!settings.hooks) {
    settings.hooks = {};
  }

  let installedCount = 0;
  let updatedCount = 0;

  for (const hookType of HOOK_TYPES) {
    if (!settings.hooks[hookType]) {
      settings.hooks[hookType] = [];
    }

    const existing = settings.hooks[hookType];

    // Remove any existing pixel-agents hooks (to avoid duplicates on re-install)
    const otherHooks = existing.filter((entry) => !isOurHook(entry));
    const hadOurs = existing.length !== otherHooks.length;

    // Add our hook
    otherHooks.push({ command: buildHookCommand(hookType) });

    settings.hooks[hookType] = otherHooks;

    if (hadOurs) {
      updatedCount++;
    } else {
      installedCount++;
    }
  }

  writeSettings(settings);

  console.log("Pixel Agents hooks configured successfully!");
  if (installedCount > 0) {
    console.log(`  Installed ${installedCount} new hook(s).`);
  }
  if (updatedCount > 0) {
    console.log(`  Updated ${updatedCount} existing hook(s).`);
  }
  console.log(`\nSettings written to: ${CLAUDE_SETTINGS_FILE}`);
  console.log(
    "\nHook script location: " + HOOK_SCRIPT,
  );
  console.log(
    "\nMake sure the Pixel Agents Electron app is running for hooks to take effect.",
  );
}

// ─── Uninstall ──────────────────────────────────────────────────────────────

function uninstall(): void {
  const settings = readSettings();
  if (!settings.hooks) {
    console.log("No hooks found in Claude Code settings. Nothing to remove.");
    return;
  }

  let removedCount = 0;

  for (const hookType of HOOK_TYPES) {
    const existing = settings.hooks[hookType];
    if (!existing) continue;

    const filtered = existing.filter((entry) => !isOurHook(entry));
    const removed = existing.length - filtered.length;

    if (removed > 0) {
      removedCount += removed;

      if (filtered.length === 0) {
        // Remove the hook type entirely if no other hooks remain
        delete settings.hooks[hookType];
      } else {
        settings.hooks[hookType] = filtered;
      }
    }
  }

  // Clean up empty hooks object
  if (
    settings.hooks &&
    Object.keys(settings.hooks).length === 0
  ) {
    delete settings.hooks;
  }

  writeSettings(settings);

  if (removedCount > 0) {
    console.log(
      `Removed ${removedCount} Pixel Agents hook(s) from Claude Code settings.`,
    );
  } else {
    console.log("No Pixel Agents hooks found. Nothing to remove.");
  }
  console.log(`Settings written to: ${CLAUDE_SETTINGS_FILE}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isUninstall = args.includes("--uninstall") || args.includes("-u");

if (isUninstall) {
  uninstall();
} else {
  install();
}
