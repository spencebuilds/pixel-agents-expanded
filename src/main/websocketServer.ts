import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as net from "net";

// ─── Hook event types ────────────────────────────────────────────────────────

export interface HookSessionStart {
  type: "sessionStart";
  sessionId: string;
  projectPath: string;
}

export interface HookPreToolUse {
  type: "preToolUse";
  sessionId: string;
  tool: string;
  input: unknown;
}

export interface HookPostToolUse {
  type: "postToolUse";
  sessionId: string;
  tool: string;
  output: unknown;
}

export interface HookStop {
  type: "stop";
  sessionId: string;
}

export type HookEvent =
  | HookSessionStart
  | HookPreToolUse
  | HookPostToolUse
  | HookStop;

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PORT = 17245;
const MAX_PORT_ATTEMPTS = 10;
const LOCKFILE_DIR = path.join(os.homedir(), ".pixel-agents");
const LOCKFILE_PATH = path.join(LOCKFILE_DIR, "ws-port");

// ─── Event emitter ───────────────────────────────────────────────────────────

const hookEmitter = new EventEmitter();

/**
 * Register a listener for parsed hook events from Claude Code.
 */
export function onHookEvent(callback: (event: HookEvent) => void): void {
  hookEmitter.on("hookEvent", callback);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check whether a port is available by attempting to listen briefly. */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** Write the active port to the lockfile so hooks can discover it. */
function writeLockfile(port: number): void {
  if (!fs.existsSync(LOCKFILE_DIR)) {
    fs.mkdirSync(LOCKFILE_DIR, { recursive: true });
  }
  fs.writeFileSync(LOCKFILE_PATH, String(port), "utf-8");
  console.log(`[ws] Lockfile written: ${LOCKFILE_PATH} -> ${port}`);
}

/** Remove the lockfile on shutdown. */
function removeLockfile(): void {
  try {
    if (fs.existsSync(LOCKFILE_PATH)) {
      fs.unlinkSync(LOCKFILE_PATH);
      console.log("[ws] Lockfile removed");
    }
  } catch {
    // Best-effort cleanup; ignore errors
  }
}

// ─── Message validation ──────────────────────────────────────────────────────

const VALID_TYPES = new Set([
  "sessionStart",
  "preToolUse",
  "postToolUse",
  "stop",
]);

function isValidHookEvent(data: unknown): data is HookEvent {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.type !== "string" || !VALID_TYPES.has(obj.type)) return false;
  if (typeof obj.sessionId !== "string") return false;

  switch (obj.type) {
    case "sessionStart":
      return typeof obj.projectPath === "string";
    case "preToolUse":
      return typeof obj.tool === "string" && "input" in obj;
    case "postToolUse":
      return typeof obj.tool === "string" && "output" in obj;
    case "stop":
      return true;
    default:
      return false;
  }
}

// ─── Server ──────────────────────────────────────────────────────────────────

/**
 * Start the local WebSocket server for Claude Code hook events.
 *
 * Tries ports starting at 17245, incrementing up to 10 times until an
 * available port is found. Writes the active port to a lockfile at
 * `~/.pixel-agents/ws-port` for hook discovery.
 *
 * @returns The active port and a `stop()` function to shut down the server.
 */
export async function startWebSocketServer(): Promise<{
  port: number;
  stop: () => void;
}> {
  // Find an available port
  let chosenPort: number | null = null;
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const candidate = DEFAULT_PORT + i;
    if (await isPortAvailable(candidate)) {
      chosenPort = candidate;
      break;
    }
    console.log(`[ws] Port ${candidate} in use, trying next...`);
  }

  if (chosenPort === null) {
    throw new Error(
      `[ws] Could not find an available port in range ${DEFAULT_PORT}-${DEFAULT_PORT + MAX_PORT_ATTEMPTS - 1}`,
    );
  }

  const clients = new Set<WebSocket>();

  const wss = new WebSocketServer({ host: "127.0.0.1", port: chosenPort });

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(
      `[ws] Client connected (total: ${clients.size})`,
    );

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        console.warn("[ws] Received malformed JSON, ignoring");
        return;
      }

      if (!isValidHookEvent(parsed)) {
        console.warn("[ws] Received invalid hook event structure, ignoring:", parsed);
        return;
      }

      hookEmitter.emit("hookEvent", parsed);
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(
        `[ws] Client disconnected (total: ${clients.size})`,
      );
    });

    ws.on("error", (err) => {
      console.error("[ws] Client error:", err.message);
      clients.delete(ws);
    });
  });

  writeLockfile(chosenPort);

  console.log(`[ws] WebSocket server listening on 127.0.0.1:${chosenPort}`);

  const stop = (): void => {
    removeLockfile();
    for (const client of clients) {
      client.close();
    }
    clients.clear();
    wss.close(() => {
      console.log("[ws] WebSocket server stopped");
    });
  };

  return { port: chosenPort, stop };
}
