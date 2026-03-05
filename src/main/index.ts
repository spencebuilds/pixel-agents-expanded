import { app, BrowserWindow, Tray } from "electron";
import * as path from "path";
import { registerIpcHandlers } from "./ipc";
import { TranscriptWatcher } from "./transcriptWatcher";
import { startWebSocketServer } from "./websocketServer";
import { AgentManager } from "./agentManager";
import { createTray } from "./tray";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let stopWebSocketServer: (() => void) | null = null;
const transcriptWatcher = new TranscriptWatcher();
const agentManager = new AgentManager(transcriptWatcher);

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
  agentManager.setWindow(mainWindow);

  if (!app.isPackaged) {
    // Development: load from Vite dev server
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: load the built renderer
    mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    agentManager.setWindow(null);
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow();
  if (mainWindow) {
    tray = createTray(mainWindow);
  }
  agentManager.start();
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
  agentManager.stop();
  transcriptWatcher.stopWatching();
  if (stopWebSocketServer) {
    stopWebSocketServer();
    stopWebSocketServer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
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
