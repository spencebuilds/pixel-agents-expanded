import { BrowserWindow, ipcMain } from "electron";
import { IpcChannels } from "../shared/types";
import type { Agent, AgentUpdate } from "../shared/types";

// ─── In-memory agent store (will be populated by later chunks) ───────────────

let agents: Agent[] = [];

/** Replace the full agent list (called by watchers in later chunks). */
export function setAgents(updated: Agent[]): void {
  agents = updated;
}

/** Get the current agent list. */
export function getAgents(): Agent[] {
  return agents;
}

// ─── Renderer push helper ────────────────────────────────────────────────────

/**
 * Send an AgentUpdate to the renderer window.
 * Safe to call even if the window has been destroyed.
 */
export function sendAgentUpdate(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  const update: AgentUpdate = { agents };
  win.webContents.send(IpcChannels.AGENT_UPDATE, update);
}

// ─── Handler registration ────────────────────────────────────────────────────

/**
 * Register all IPC handlers.  Call once from the main entry point after the
 * BrowserWindow has been created.
 *
 * @param mainWindow — the primary BrowserWindow (used for push messages).
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IpcChannels.GET_AGENTS, () => {
    return agents;
  });

  ipcMain.handle(
    IpcChannels.TOGGLE_ALWAYS_ON_TOP,
    (_event, alwaysOnTop: boolean) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(alwaysOnTop);
      }
    }
  );
}
