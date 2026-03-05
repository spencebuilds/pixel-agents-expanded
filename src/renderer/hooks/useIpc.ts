import { useEffect, useState } from "react";
import type { Agent, AgentUpdate, PixelAgentsApi } from "../../shared/types.ts";

/** Type-safe accessor for the preload API exposed on `window`. */
function getApi(): PixelAgentsApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).pixelAgents as PixelAgentsApi;
}

/**
 * React hook that manages agent state via the preload IPC bridge.
 *
 * - Fetches the initial agent list on mount.
 * - Subscribes to real-time `AgentUpdate` pushes from the main process.
 * - Cleans up the subscription on unmount.
 */
export function useAgents(): { agents: Agent[]; loading: boolean } {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const api = getApi();

    // Fetch the initial snapshot.
    api.getAgents().then((initial) => {
      setAgents(initial);
      setLoading(false);
    });

    // Subscribe to live updates.
    const unsubscribe = api.onAgentUpdate((update: AgentUpdate) => {
      setAgents(update.agents);
    });

    return unsubscribe;
  }, []);

  return { agents, loading };
}
