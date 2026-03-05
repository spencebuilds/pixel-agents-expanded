import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

// Inline IPC channel names to avoid importing shared/types (Electron's
// sandboxed preload cannot resolve sibling modules).
const Channels = {
  GET_AGENTS: "get-agents",
  AGENT_UPDATE: "agent-update",
  ASSETS_LOADED: "assets-loaded",
  OPEN_SETTINGS: "open-settings",
  TOGGLE_ALWAYS_ON_TOP: "toggle-always-on-top",
} as const;

const api = {
  onAgentUpdate(callback: (update: any) => void): () => void {
    const handler = (_event: IpcRendererEvent, update: any) =>
      callback(update);
    ipcRenderer.on(Channels.AGENT_UPDATE, handler);
    return () => {
      ipcRenderer.removeListener(Channels.AGENT_UPDATE, handler);
    };
  },

  getAgents(): Promise<any[]> {
    return ipcRenderer.invoke(Channels.GET_AGENTS);
  },

  onAssetsLoaded(callback: (assets: unknown) => void): () => void {
    const handler = (_event: IpcRendererEvent, assets: unknown) =>
      callback(assets);
    ipcRenderer.on(Channels.ASSETS_LOADED, handler);
    return () => {
      ipcRenderer.removeListener(Channels.ASSETS_LOADED, handler);
    };
  },

  onOpenSettings(callback: () => void): () => void {
    const handler = () => callback();
    ipcRenderer.on(Channels.OPEN_SETTINGS, handler);
    return () => {
      ipcRenderer.removeListener(Channels.OPEN_SETTINGS, handler);
    };
  },

  toggleAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    return ipcRenderer.invoke(Channels.TOGGLE_ALWAYS_ON_TOP, alwaysOnTop);
  },
};

contextBridge.exposeInMainWorld("pixelAgents", api);
