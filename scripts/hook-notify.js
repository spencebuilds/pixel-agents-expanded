#!/usr/bin/env node
/**
 * hook-notify.js — Claude Code hook notification script
 *
 * Called by Claude Code hooks to forward events to the Pixel Agents
 * Electron app via its local WebSocket server.
 *
 * Usage:
 *   echo '{"session_id":"abc","...":"..."}' | node hook-notify.js <hookType>
 *
 * Where <hookType> is one of: sessionStart, preToolUse, postToolUse, stop
 *
 * The script reads event data from stdin (JSON), reads the WebSocket port
 * from ~/.pixel-agents/ws-port, connects, sends the message, and exits.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const hookType = process.argv[2];
if (!hookType) {
  // No hook type provided — exit silently (don't break Claude Code)
  process.exit(0);
}

const VALID_TYPES = new Set(["sessionStart", "preToolUse", "postToolUse", "stop"]);
if (!VALID_TYPES.has(hookType)) {
  process.exit(0);
}

const LOCKFILE = path.join(os.homedir(), ".pixel-agents", "ws-port");

// Collect stdin
let stdinData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinData += chunk;
});

process.stdin.on("end", () => {
  send().catch(() => {
    // Swallow errors — hooks must never break Claude Code
    process.exit(0);
  });
});

// If stdin closes without data, still attempt (some hook types may have no payload)
process.stdin.resume();

// Safety timeout: never hang longer than 3 seconds
setTimeout(() => process.exit(0), 3000);

async function send() {
  // Read the port from the lockfile
  let port;
  try {
    port = fs.readFileSync(LOCKFILE, "utf8").trim();
  } catch {
    // Pixel Agents not running — exit silently
    process.exit(0);
  }

  if (!port || isNaN(Number(port))) {
    process.exit(0);
  }

  // Parse stdin event data
  let eventData = {};
  if (stdinData.trim()) {
    try {
      eventData = JSON.parse(stdinData);
    } catch {
      // Invalid JSON from stdin — exit silently
      process.exit(0);
    }
  }

  // Build the message payload matching HookEvent types expected by the server
  const message = buildMessage(hookType, eventData);
  if (!message) {
    process.exit(0);
  }

  // Try to load the `ws` package from the project's node_modules
  let WebSocket;
  try {
    // First try: resolve from this script's location (project node_modules)
    const wsPath = path.join(__dirname, "..", "node_modules", "ws");
    WebSocket = require(wsPath);
  } catch {
    try {
      // Second try: global require (if ws is installed globally or NODE_PATH is set)
      WebSocket = require("ws");
    } catch {
      // ws not available — fall back to raw HTTP upgrade
      await sendViaHttp(port, message);
      return;
    }
  }

  // Send via WebSocket
  await sendViaWs(WebSocket, port, message);
}

/**
 * Build the message payload from Claude Code hook event data.
 *
 * Claude Code hooks provide event data on stdin as JSON. The exact shape
 * varies by hook type. We normalize it into our HookEvent format.
 */
function buildMessage(type, eventData) {
  // Claude Code hook stdin data includes session_id (or sessionId)
  const sessionId =
    eventData.session_id || eventData.sessionId || "unknown";

  switch (type) {
    case "sessionStart":
      return {
        type: "sessionStart",
        sessionId,
        projectPath: eventData.cwd || eventData.project_path || eventData.projectPath || process.cwd(),
      };

    case "preToolUse":
      return {
        type: "preToolUse",
        sessionId,
        tool: eventData.tool_name || eventData.tool || "unknown",
        input: eventData.tool_input || eventData.input || {},
      };

    case "postToolUse":
      return {
        type: "postToolUse",
        sessionId,
        tool: eventData.tool_name || eventData.tool || "unknown",
        output: eventData.tool_output || eventData.output || {},
      };

    case "stop":
      return {
        type: "stop",
        sessionId,
      };

    default:
      return null;
  }
}

/**
 * Send via the `ws` WebSocket library.
 */
function sendViaWs(WebSocket, port, message) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.on("open", () => {
      ws.send(JSON.stringify(message), () => {
        ws.close();
        resolve();
      });
    });

    ws.on("error", () => {
      // Server not reachable — exit silently
      resolve();
    });

    ws.on("close", () => {
      resolve();
    });
  });
}

/**
 * Fallback: send via raw TCP using the WebSocket protocol.
 * This handles the case where the `ws` package is not available.
 *
 * Implements a minimal WebSocket handshake + single text frame.
 */
function sendViaHttp(port, message) {
  const net = require("net");
  const crypto = require("crypto");

  return new Promise((resolve) => {
    const key = crypto.randomBytes(16).toString("base64");
    const payload = JSON.stringify(message);

    const socket = net.createConnection({ host: "127.0.0.1", port: Number(port) }, () => {
      // Send WebSocket upgrade request
      const request = [
        "GET / HTTP/1.1",
        "Host: 127.0.0.1:" + port,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: " + key,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n");

      socket.write(request);
    });

    let handshakeComplete = false;
    let buffer = Buffer.alloc(0);

    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);

      if (!handshakeComplete) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return; // Wait for full headers

        const headers = buffer.slice(0, headerEnd).toString();
        if (!headers.includes("101")) {
          // Handshake failed
          socket.destroy();
          resolve();
          return;
        }

        handshakeComplete = true;

        // Send the payload as a WebSocket text frame
        const payloadBuf = Buffer.from(payload, "utf8");
        const frame = buildWebSocketFrame(payloadBuf);
        socket.write(frame, () => {
          // Send close frame
          const closeFrame = Buffer.alloc(6);
          closeFrame[0] = 0x88; // FIN + close opcode
          closeFrame[1] = 0x80; // Masked, 0 length
          // Masking key (4 bytes of 0 is fine for close)
          socket.write(closeFrame, () => {
            socket.end();
            resolve();
          });
        });
      }
    });

    socket.on("error", () => resolve());
    socket.on("close", () => resolve());
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve();
    });
  });
}

/**
 * Build a masked WebSocket text frame (required for client-to-server messages).
 */
function buildWebSocketFrame(payload) {
  const crypto = require("crypto");
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = 0x80 | length; // Masked
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    // Write as two 32-bit values (Node.js BigInt not needed for typical payloads)
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }

  // Masking key
  const mask = crypto.randomBytes(4);

  // Apply mask to payload
  const masked = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    masked[i] = payload[i] ^ mask[i % 4];
  }

  return Buffer.concat([header, mask, masked]);
}
