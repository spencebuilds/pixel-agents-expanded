import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

export interface PixelAgentsAPI {
  /** Subscribe to agent state updates pushed from the main process. */
  onAgentUpdate(callback: (agents: unknown[]) => void): () => void;

  /** Request the current list of agents from the main process. */
  getAgents(): Promise<unknown[]>;

  /** Subscribe to asset data pushed from the main process. */
  onAssetsLoaded(callback: (assets: unknown) => void): () => void;
}

const api: PixelAgentsAPI = {
  onAgentUpdate(callback: (agents: unknown[]) => void): () => void {
    const handler = (_event: IpcRendererEvent, agents: unknown[]) =>
      callback(agents);
    ipcRenderer.on("agent-update", handler);
    return () => {
      ipcRenderer.removeListener("agent-update", handler);
    };
  },

  getAgents(): Promise<unknown[]> {
    return ipcRenderer.invoke("get-agents");
  },

  onAssetsLoaded(callback: (assets: unknown) => void): () => void {
    const handler = (_event: IpcRendererEvent, assets: unknown) =>
      callback(assets);
    ipcRenderer.on("assets-loaded", handler);
    return () => {
      ipcRenderer.removeListener("assets-loaded", handler);
    };
  },
};

contextBridge.exposeInMainWorld("pixelAgents", api);
