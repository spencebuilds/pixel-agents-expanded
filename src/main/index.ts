import { app, BrowserWindow } from "electron";
import * as path from "path";
import { registerIpcHandlers, sendAgentUpdate, setAgents } from "./ipc";
import { TranscriptWatcher } from "./transcriptWatcher";
import { startWebSocketServer } from "./websocketServer";
import type { Agent } from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let stopWebSocketServer: (() => void) | null = null;
const transcriptWatcher = new TranscriptWatcher();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Pixel Agents",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  registerIpcHandlers(mainWindow);

  if (!app.isPackaged) {
    // Development: load from Vite dev server
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load the built renderer
    mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Map transcript watcher state to renderer-visible Agent[] ────────────────

function buildAgentList(): Agent[] {
  const agents: Agent[] = [];
  let paletteIdx = 0;
  for (const session of transcriptWatcher.agents.values()) {
    // Determine high-level state
    let state: Agent["state"] = "idle";
    if (session.activeToolIds.size > 0) {
      // Pick a representative tool name for activity display
      const firstToolId = session.activeToolIds.values().next().value as string;
      const toolName = session.activeToolNames.get(firstToolId);
      if (toolName === "Read" || toolName === "Grep" || toolName === "Glob") {
        state = "reading";
      } else {
        state = "active";
      }
    } else if (session.isWaiting) {
      state = "waiting";
    }

    // Get current tool status text
    let currentTool: string | undefined;
    if (session.activeToolStatuses.size > 0) {
      currentTool = session.activeToolStatuses.values().next().value as string;
    }

    agents.push({
      id: session.id,
      name: session.folderName || `Agent ${session.id}`,
      state,
      currentTool,
      sessionFile: session.jsonlFile,
      paletteIndex: paletteIdx % 6,
      folderName: session.folderName,
    });
    paletteIdx++;
  }
  return agents;
}

/** Sync the IPC agent store and push an update to the renderer. */
function pushUpdate(): void {
  const agents = buildAgentList();
  setAgents(agents);
  sendAgentUpdate(mainWindow);
}

// ─── Wire transcript events to the renderer ──────────────────────────────────

function wireTranscriptEvents(): void {
  const em = transcriptWatcher.emitter;

  em.on("agentStatus", (_payload) => {
    pushUpdate();
  });

  em.on("agentToolStart", (_payload) => {
    pushUpdate();
  });

  em.on("agentToolDone", (_payload) => {
    pushUpdate();
  });

  em.on("agentToolsClear", (_payload) => {
    pushUpdate();
  });

  em.on("agentToolPermission", (_payload) => {
    pushUpdate();
  });

  em.on("subagentToolStart", (_payload) => {
    pushUpdate();
  });

  em.on("subagentToolDone", (_payload) => {
    pushUpdate();
  });

  em.on("subagentClear", (_payload) => {
    pushUpdate();
  });

  em.on("subagentToolPermission", (_payload) => {
    pushUpdate();
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow();
  wireTranscriptEvents();
  transcriptWatcher.startWatching();

  try {
    const ws = await startWebSocketServer();
    stopWebSocketServer = ws.stop;
    console.log(`[main] WebSocket server started on port ${ws.port}`);
  } catch (err) {
    console.error("[main] Failed to start WebSocket server:", err);
  }
});

app.on("window-all-closed", () => {
  transcriptWatcher.stopWatching();
  if (stopWebSocketServer) {
    stopWebSocketServer();
    stopWebSocketServer = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
