/**
 * Central agent lifecycle manager.
 *
 * Merges two detection sources — JSONL transcript watcher (fallback) and
 * WebSocket hook events (primary) — into a single Agent[] that is pushed
 * to the renderer via IPC.
 */

import type { BrowserWindow } from "electron";
import type { Agent, AgentState } from "../shared/types";
import type { TranscriptWatcher } from "./transcriptWatcher";
import { onHookEvent, type HookEvent } from "./websocketServer";
import { setAgents, sendAgentUpdate } from "./ipc";
import { isReadingTool } from "./transcriptParser";

// ─── Constants ───────────────────────────────────────────────────────────────

/** How long an agent can be idle before it is automatically removed. */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Reading tools that map to the "reading" state (WS hook path). */
const READING_TOOL_NAMES = new Set(["Read", "Grep", "Glob", "WebFetch", "WebSearch"]);

/** Number of palettes available for real agents (0-4; palette 5 is reserved for PM). */
const PALETTE_COUNT = 5;

// ─── Managed agent record ────────────────────────────────────────────────────

/** Internal record for a managed agent, keyed by a string managedId. */
interface ManagedAgent {
  /** Unique key in the managed map (WS sessionId or "jsonl-<agentId>"). */
  managedId: string;
  /** Numeric ID exposed to the renderer (matches transcript agentId when available). */
  renderId: number;
  /** Display name. */
  name: string;
  /** Current high-level state. */
  state: AgentState;
  /** Currently active tool name, if any. */
  currentTool?: string;
  /** JSONL session file path, if tracked by transcript watcher. */
  sessionFile?: string;
  /** Assigned palette index (0-4). */
  paletteIndex: number;
  /** Workspace folder name. */
  folderName?: string;
  /** Project path (from WS hook or transcript watcher). */
  projectPath?: string;
  /** Whether this agent is fed by WebSocket hooks (takes priority over JSONL). */
  wsSourced: boolean;
  /** Corresponding JSONL transcript agent ID (if correlated). */
  jsonlAgentId?: number;
  /** WS session ID (if sourced from hooks). */
  wsSessionId?: string;
  /** Set of currently active tool names (WS-tracked). */
  activeTools: Set<string>;
  /** Timestamp of last event (for idle cleanup). */
  lastEventTime: number;
}

// ─── AgentManager ────────────────────────────────────────────────────────────

export class AgentManager {
  private managed = new Map<string, ManagedAgent>();
  private nextRenderId = 1000; // start high to avoid collisions with transcript IDs
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private mainWindow: BrowserWindow | null = null;
  private transcriptWatcher: TranscriptWatcher;

  /** Maps WS sessionId -> managedId for quick lookup. */
  private wsSessionToManaged = new Map<string, string>();

  /** Maps JSONL agentId -> managedId for quick lookup. */
  private jsonlToManaged = new Map<number, string>();

  /** Palette indices currently in use, for cycling. */
  private nextPaletteSlot = 0;

  constructor(transcriptWatcher: TranscriptWatcher) {
    this.transcriptWatcher = transcriptWatcher;
  }

  /** Set (or update) the main window reference. */
  setWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Wire up event listeners and start the idle-cleanup timer. */
  start(): void {
    this.wireTranscriptEvents();
    this.wireHookEvents();
    this.cleanupTimer = setInterval(() => this.cleanupIdleAgents(), 60_000);
  }

  /** Tear down listeners and timers. */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.managed.clear();
    this.wsSessionToManaged.clear();
    this.jsonlToManaged.clear();
  }

  // ── Palette assignment ─────────────────────────────────────────────────────

  private allocatePalette(): number {
    const idx = this.nextPaletteSlot % PALETTE_COUNT;
    this.nextPaletteSlot++;
    return idx;
  }

  // ── Hook event handling ────────────────────────────────────────────────────

  private wireHookEvents(): void {
    onHookEvent((event: HookEvent) => {
      this.handleHookEvent(event);
    });
  }

  private handleHookEvent(event: HookEvent): void {
    switch (event.type) {
      case "sessionStart":
        this.onSessionStart(event.sessionId, event.projectPath);
        break;
      case "preToolUse":
        this.onPreToolUse(event.sessionId, event.tool);
        break;
      case "postToolUse":
        this.onPostToolUse(event.sessionId, event.tool);
        break;
      case "stop":
        this.onStop(event.sessionId);
        break;
    }
  }

  private onSessionStart(sessionId: string, projectPath: string): void {
    // Check if there's already a JSONL-tracked agent for the same project path
    let existingManagedId: string | undefined;
    for (const [mId, agent] of this.managed) {
      if (!agent.wsSourced && agent.projectPath === projectPath) {
        existingManagedId = mId;
        break;
      }
    }

    if (existingManagedId) {
      // Merge: upgrade existing JSONL agent to WS-sourced
      const existing = this.managed.get(existingManagedId)!;
      existing.wsSourced = true;
      existing.wsSessionId = sessionId;
      existing.state = "active";
      existing.lastEventTime = Date.now();
      this.wsSessionToManaged.set(sessionId, existingManagedId);
    } else {
      // Check if we already track this WS session
      if (this.wsSessionToManaged.has(sessionId)) {
        const agent = this.managed.get(this.wsSessionToManaged.get(sessionId)!)!;
        agent.state = "active";
        agent.lastEventTime = Date.now();
      } else {
        // Create new managed agent
        const managedId = `ws-${sessionId}`;
        const folderName = projectPath.split("/").pop() || projectPath;
        const agent: ManagedAgent = {
          managedId,
          renderId: this.nextRenderId++,
          name: folderName,
          state: "active",
          paletteIndex: this.allocatePalette(),
          folderName,
          projectPath,
          wsSourced: true,
          wsSessionId: sessionId,
          activeTools: new Set(),
          lastEventTime: Date.now(),
        };
        this.managed.set(managedId, agent);
        this.wsSessionToManaged.set(sessionId, managedId);
      }
    }

    this.pushUpdate();
  }

  private onPreToolUse(sessionId: string, tool: string): void {
    const managedId = this.wsSessionToManaged.get(sessionId);
    if (!managedId) return;
    const agent = this.managed.get(managedId);
    if (!agent) return;

    agent.activeTools.add(tool);
    agent.currentTool = tool;
    agent.state = READING_TOOL_NAMES.has(tool) ? "reading" : "active";
    agent.lastEventTime = Date.now();

    this.pushUpdate();
  }

  private onPostToolUse(sessionId: string, tool: string): void {
    const managedId = this.wsSessionToManaged.get(sessionId);
    if (!managedId) return;
    const agent = this.managed.get(managedId);
    if (!agent) return;

    agent.activeTools.delete(tool);
    agent.lastEventTime = Date.now();

    // Update currentTool and state based on remaining tools
    if (agent.activeTools.size === 0) {
      agent.currentTool = undefined;
      agent.state = "active"; // still active between tools
    } else {
      // Pick the first remaining tool
      const remaining = agent.activeTools.values().next().value as string;
      agent.currentTool = remaining;
      agent.state = READING_TOOL_NAMES.has(remaining) ? "reading" : "active";
    }

    this.pushUpdate();
  }

  private onStop(sessionId: string): void {
    const managedId = this.wsSessionToManaged.get(sessionId);
    if (!managedId) return;
    const agent = this.managed.get(managedId);
    if (!agent) return;

    agent.state = "idle";
    agent.currentTool = undefined;
    agent.activeTools.clear();
    agent.lastEventTime = Date.now();

    this.pushUpdate();
  }

  // ── Transcript watcher integration ─────────────────────────────────────────

  private wireTranscriptEvents(): void {
    const em = this.transcriptWatcher.emitter;

    const handleUpdate = (): void => {
      this.syncFromTranscriptWatcher();
      this.pushUpdate();
    };

    em.on("agentStatus", handleUpdate);
    em.on("agentToolStart", handleUpdate);
    em.on("agentToolDone", handleUpdate);
    em.on("agentToolsClear", handleUpdate);
    em.on("agentToolPermission", handleUpdate);
    em.on("subagentToolStart", handleUpdate);
    em.on("subagentToolDone", handleUpdate);
    em.on("subagentClear", handleUpdate);
    em.on("subagentToolPermission", handleUpdate);
  }

  /**
   * Sync the managed map from the transcript watcher's agent sessions.
   * For JSONL-tracked agents that are NOT ws-sourced, derive state from session data.
   */
  private syncFromTranscriptWatcher(): void {
    for (const session of this.transcriptWatcher.agents.values()) {
      let managedId = this.jsonlToManaged.get(session.id);

      if (managedId) {
        const agent = this.managed.get(managedId);
        if (!agent) continue;

        // If this agent is WS-sourced, JSONL events are deprioritized
        if (agent.wsSourced) continue;

        // Update state from JSONL session
        this.updateFromSession(agent, session);
      } else {
        // New JSONL-tracked agent
        managedId = `jsonl-${session.id}`;
        const agent: ManagedAgent = {
          managedId,
          renderId: session.id,
          name: session.folderName || `Agent ${session.id}`,
          state: "idle",
          paletteIndex: this.allocatePalette(),
          sessionFile: session.jsonlFile,
          folderName: session.folderName,
          projectPath: session.projectDir,
          wsSourced: false,
          jsonlAgentId: session.id,
          activeTools: new Set(),
          lastEventTime: Date.now(),
        };
        this.updateFromSession(agent, session);
        this.managed.set(managedId, agent);
        this.jsonlToManaged.set(session.id, managedId);
      }
    }

    // Remove managed agents whose JSONL session no longer exists
    for (const [agentId, managedId] of this.jsonlToManaged) {
      if (!this.transcriptWatcher.agents.has(agentId)) {
        const agent = this.managed.get(managedId);
        if (agent && !agent.wsSourced) {
          this.managed.delete(managedId);
        }
        this.jsonlToManaged.delete(agentId);
      }
    }
  }

  /** Derive state and currentTool from a JSONL AgentSession. */
  private updateFromSession(
    agent: ManagedAgent,
    session: import("../shared/types").AgentSession,
  ): void {
    let state: AgentState = "idle";
    if (session.activeToolIds.size > 0) {
      const firstToolId = session.activeToolIds.values().next().value as string;
      const toolName = session.activeToolNames.get(firstToolId);
      if (toolName && isReadingTool(toolName)) {
        state = "reading";
      } else {
        state = "active";
      }
    } else if (session.isWaiting) {
      state = "waiting";
    }

    let currentTool: string | undefined;
    if (session.activeToolStatuses.size > 0) {
      currentTool = session.activeToolStatuses.values().next().value as string;
    }

    agent.state = state;
    agent.currentTool = currentTool;
    agent.sessionFile = session.jsonlFile;
    agent.folderName = session.folderName;
    agent.name = session.folderName || `Agent ${session.id}`;
    agent.lastEventTime = Date.now();
  }

  // ── Push to renderer ───────────────────────────────────────────────────────

  private pushUpdate(): void {
    const agents = this.buildAgentList();
    setAgents(agents);
    sendAgentUpdate(this.mainWindow);
  }

  private buildAgentList(): Agent[] {
    const agents: Agent[] = [];
    for (const managed of this.managed.values()) {
      agents.push({
        id: managed.renderId,
        name: managed.name,
        state: managed.state,
        currentTool: managed.currentTool,
        sessionFile: managed.sessionFile,
        paletteIndex: managed.paletteIndex,
        folderName: managed.folderName,
      });
    }
    return agents;
  }

  // ── Idle cleanup ───────────────────────────────────────────────────────────

  private cleanupIdleAgents(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [managedId, agent] of this.managed) {
      if (
        agent.state === "idle" &&
        now - agent.lastEventTime > IDLE_TIMEOUT_MS
      ) {
        toRemove.push(managedId);
      }
    }

    if (toRemove.length === 0) return;

    for (const managedId of toRemove) {
      const agent = this.managed.get(managedId);
      if (agent) {
        if (agent.wsSessionId) {
          this.wsSessionToManaged.delete(agent.wsSessionId);
        }
        if (agent.jsonlAgentId !== undefined) {
          this.jsonlToManaged.delete(agent.jsonlAgentId);
        }
      }
      this.managed.delete(managedId);
    }

    console.log(
      `[AgentManager] Cleaned up ${toRemove.length} idle agent(s)`,
    );
    this.pushUpdate();
  }
}
