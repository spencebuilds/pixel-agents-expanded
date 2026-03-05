import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IpcChannels } from "../shared/types";
import type { Agent, AgentUpdate, PixelAgentsApi } from "../shared/types";

const api: PixelAgentsApi = {
  onAgentUpdate(callback: (update: AgentUpdate) => void): () => void {
    const handler = (_event: IpcRendererEvent, update: AgentUpdate) =>
      callback(update);
    ipcRenderer.on(IpcChannels.AGENT_UPDATE, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.AGENT_UPDATE, handler);
    };
  },

  getAgents(): Promise<Agent[]> {
    return ipcRenderer.invoke(IpcChannels.GET_AGENTS);
  },

  onAssetsLoaded(callback: (assets: unknown) => void): () => void {
    const handler = (_event: IpcRendererEvent, assets: unknown) =>
      callback(assets);
    ipcRenderer.on(IpcChannels.ASSETS_LOADED, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.ASSETS_LOADED, handler);
    };
  },
};

contextBridge.exposeInMainWorld("pixelAgents", api);
