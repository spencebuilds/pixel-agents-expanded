/**
 * JSONL transcript parser for Claude Code agent detection.
 *
 * Parses Claude Code transcript files line-by-line and emits events when agent
 * state transitions occur (tool start/done, permission waits, sub-agent
 * activity, idle detection).
 *
 * Adapted from the VS Code extension version to use Node.js EventEmitter
 * instead of vscode.Webview.postMessage.
 */

import * as path from "path";
import { EventEmitter } from "events";
import type { AgentSession, TranscriptEvents } from "../shared/types";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Delay (ms) after a tool result before emitting "done" for animation purposes. */
const TOOL_DONE_DELAY_MS = 300;

/** If no new JSONL data arrives within this window after a text-only assistant
 *  response, the agent is assumed to be waiting for input. */
const TEXT_IDLE_DELAY_MS = 5000;

/** If a non-exempt tool has been active for this long without a result, the
 *  agent is likely waiting for user permission. */
const PERMISSION_TIMER_DELAY_MS = 7000;

/** Maximum characters shown for a bash command in status text. */
const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;

/** Maximum characters shown for a Task description in status text. */
const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ─── Tool classification ─────────────────────────────────────────────────────

/** Tools that are read-only / passive. */
export const READING_TOOLS = new Set([
  "Read",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
]);

/** Tools exempt from permission-wait detection (they naturally block). */
export const PERMISSION_EXEMPT_TOOLS = new Set(["Task", "AskUserQuestion"]);

// ─── Status formatting ──────────────────────────────────────────────────────

/** Build a human-readable status string for a tool invocation. */
export function formatToolStatus(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const base = (p: unknown) => (typeof p === "string" ? path.basename(p) : "");
  switch (toolName) {
    case "Read":
      return `Reading ${base(input.file_path)}`;
    case "Edit":
      return `Editing ${base(input.file_path)}`;
    case "Write":
      return `Writing ${base(input.file_path)}`;
    case "Bash": {
      const cmd = (input.command as string) || "";
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + "\u2026" : cmd}`;
    }
    case "Glob":
      return "Searching files";
    case "Grep":
      return "Searching code";
    case "WebFetch":
      return "Fetching web content";
    case "WebSearch":
      return "Searching the web";
    case "Task": {
      const desc = typeof input.description === "string" ? input.description : "";
      return desc
        ? `Subtask: ${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + "\u2026" : desc}`
        : "Running subtask";
    }
    case "AskUserQuestion":
      return "Waiting for your answer";
    case "EnterPlanMode":
      return "Planning";
    case "NotebookEdit":
      return "Editing notebook";
    default:
      return `Using ${toolName}`;
  }
}

// ─── Typed EventEmitter ──────────────────────────────────────────────────────

/**
 * Strongly-typed EventEmitter for transcript state-change events.
 *
 * Consumers use `emitter.on('agentStatus', handler)` etc.
 */
export class TranscriptEmitter extends EventEmitter {
  emit<K extends keyof TranscriptEvents>(
    event: K,
    payload: TranscriptEvents[K],
  ): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof TranscriptEvents>(
    event: K,
    listener: (payload: TranscriptEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  once<K extends keyof TranscriptEvents>(
    event: K,
    listener: (payload: TranscriptEvents[K]) => void,
  ): this {
    return super.once(event, listener);
  }

  off<K extends keyof TranscriptEvents>(
    event: K,
    listener: (payload: TranscriptEvents[K]) => void,
  ): this {
    return super.off(event, listener);
  }
}

// ─── Timer helpers (inlined from timerManager) ───────────────────────────────

function cancelTimer(
  agentId: number,
  timers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const t = timers.get(agentId);
  if (t) {
    clearTimeout(t);
    timers.delete(agentId);
  }
}

function startWaitingTimer(
  agentId: number,
  delayMs: number,
  agents: Map<number, AgentSession>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  emitter: TranscriptEmitter,
): void {
  cancelTimer(agentId, waitingTimers);
  const timer = setTimeout(() => {
    waitingTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (agent) {
      agent.isWaiting = true;
    }
    emitter.emit("agentStatus", { id: agentId, status: "waiting" });
  }, delayMs);
  waitingTimers.set(agentId, timer);
}

function startPermissionTimer(
  agentId: number,
  agents: Map<number, AgentSession>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  emitter: TranscriptEmitter,
): void {
  cancelTimer(agentId, permissionTimers);
  const timer = setTimeout(() => {
    permissionTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (!agent) return;

    // Check parent-level tools
    let hasNonExempt = false;
    for (const toolId of agent.activeToolIds) {
      const toolName = agent.activeToolNames.get(toolId);
      if (!PERMISSION_EXEMPT_TOOLS.has(toolName || "")) {
        hasNonExempt = true;
        break;
      }
    }

    // Check sub-agent tools
    const stuckSubagentParentToolIds: string[] = [];
    for (const [parentToolId, subToolNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subToolNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          stuckSubagentParentToolIds.push(parentToolId);
          hasNonExempt = true;
          break;
        }
      }
    }

    if (hasNonExempt) {
      agent.permissionSent = true;
      emitter.emit("agentToolPermission", { id: agentId });
      for (const parentToolId of stuckSubagentParentToolIds) {
        emitter.emit("subagentToolPermission", { id: agentId, parentToolId });
      }
    }
  }, PERMISSION_TIMER_DELAY_MS);
  permissionTimers.set(agentId, timer);
}

function clearAgentActivity(
  agent: AgentSession,
  agentId: number,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  emitter: TranscriptEmitter,
): void {
  agent.activeToolIds.clear();
  agent.activeToolStatuses.clear();
  agent.activeToolNames.clear();
  agent.activeSubagentToolIds.clear();
  agent.activeSubagentToolNames.clear();
  agent.isWaiting = false;
  agent.permissionSent = false;
  cancelTimer(agentId, permissionTimers);
  emitter.emit("agentToolsClear", { id: agentId });
  emitter.emit("agentStatus", { id: agentId, status: "active" });
}

// ─── Progress record handler ─────────────────────────────────────────────────

function processProgressRecord(
  agentId: number,
  record: Record<string, unknown>,
  agents: Map<number, AgentSession>,
  _waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  emitter: TranscriptEmitter,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  const parentToolId = record.parentToolUseID as string | undefined;
  if (!parentToolId) return;

  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return;

  // bash_progress / mcp_progress: tool is actively executing, restart permission timer
  const dataType = data.type as string | undefined;
  if (dataType === "bash_progress" || dataType === "mcp_progress") {
    if (agent.activeToolIds.has(parentToolId)) {
      startPermissionTimer(agentId, agents, permissionTimers, emitter);
    }
    return;
  }

  // Verify parent is an active Task tool (agent_progress handling)
  if (agent.activeToolNames.get(parentToolId) !== "Task") return;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const msgType = msg.type as string;
  const innerMsg = msg.message as Record<string, unknown> | undefined;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === "assistant") {
    let hasNonExemptSubTool = false;
    for (const block of content as Array<{
      type: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>) {
      if (block.type === "tool_use" && block.id) {
        const toolName = block.name || "";
        const status = formatToolStatus(toolName, block.input || {});

        // Track sub-tool IDs
        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) {
          subTools = new Set();
          agent.activeSubagentToolIds.set(parentToolId, subTools);
        }
        subTools.add(block.id);

        // Track sub-tool names (for permission checking)
        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) {
          subNames = new Map();
          agent.activeSubagentToolNames.set(parentToolId, subNames);
        }
        subNames.set(block.id, toolName);

        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          hasNonExemptSubTool = true;
        }

        emitter.emit("subagentToolStart", {
          id: agentId,
          parentToolId,
          toolId: block.id,
          status,
        });
      }
    }
    if (hasNonExemptSubTool) {
      startPermissionTimer(agentId, agents, permissionTimers, emitter);
    }
  } else if (msgType === "user") {
    for (const block of content as Array<{
      type: string;
      tool_use_id?: string;
    }>) {
      if (block.type === "tool_result" && block.tool_use_id) {
        // Remove from tracking
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) {
          subTools.delete(block.tool_use_id);
        }
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) {
          subNames.delete(block.tool_use_id);
        }

        const toolId = block.tool_use_id;
        setTimeout(() => {
          emitter.emit("subagentToolDone", {
            id: agentId,
            parentToolId,
            toolId,
          });
        }, TOOL_DONE_DELAY_MS);
      }
    }

    // If there are still active non-exempt sub-agent tools, restart permission timer
    let stillHasNonExempt = false;
    for (const [, subNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subNames) {
        if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
          stillHasNonExempt = true;
          break;
        }
      }
      if (stillHasNonExempt) break;
    }
    if (stillHasNonExempt) {
      startPermissionTimer(agentId, agents, permissionTimers, emitter);
    }
  }
}

// ─── Main line processor ─────────────────────────────────────────────────────

/**
 * Process a single JSONL line from a Claude Code transcript file.
 *
 * Updates the agent session state and emits events via the provided emitter.
 */
export function processTranscriptLine(
  agentId: number,
  line: string,
  agents: Map<number, AgentSession>,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  emitter: TranscriptEmitter,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  try {
    const record = JSON.parse(line) as Record<string, unknown>;

    if (
      record.type === "assistant" &&
      Array.isArray(
        (record.message as Record<string, unknown> | undefined)?.content,
      )
    ) {
      const blocks = (
        record.message as Record<string, unknown>
      ).content as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      const hasToolUse = blocks.some((b) => b.type === "tool_use");

      if (hasToolUse) {
        cancelTimer(agentId, waitingTimers);
        agent.isWaiting = false;
        agent.hadToolsInTurn = true;
        emitter.emit("agentStatus", { id: agentId, status: "active" });

        let hasNonExemptTool = false;
        for (const block of blocks) {
          if (block.type === "tool_use" && block.id) {
            const toolName = block.name || "";
            const status = formatToolStatus(toolName, block.input || {});
            agent.activeToolIds.add(block.id);
            agent.activeToolStatuses.set(block.id, status);
            agent.activeToolNames.set(block.id, toolName);

            if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
              hasNonExemptTool = true;
            }

            emitter.emit("agentToolStart", {
              id: agentId,
              toolId: block.id,
              status,
            });
          }
        }
        if (hasNonExemptTool) {
          startPermissionTimer(agentId, agents, permissionTimers, emitter);
        }
      } else if (
        blocks.some((b) => b.type === "text") &&
        !agent.hadToolsInTurn
      ) {
        // Text-only response in a turn that hasn't used any tools.
        // turn_duration handles tool-using turns reliably but is never
        // emitted for text-only turns, so we use a silence-based timer.
        startWaitingTimer(
          agentId,
          TEXT_IDLE_DELAY_MS,
          agents,
          waitingTimers,
          emitter,
        );
      }
    } else if (record.type === "progress") {
      processProgressRecord(
        agentId,
        record,
        agents,
        waitingTimers,
        permissionTimers,
        emitter,
      );
    } else if (record.type === "user") {
      const content = (record.message as Record<string, unknown> | undefined)
        ?.content;
      if (Array.isArray(content)) {
        const blocks = content as Array<{
          type: string;
          tool_use_id?: string;
        }>;
        const hasToolResult = blocks.some((b) => b.type === "tool_result");

        if (hasToolResult) {
          for (const block of blocks) {
            if (block.type === "tool_result" && block.tool_use_id) {
              const completedToolId = block.tool_use_id;

              // If the completed tool was a Task, clear its subagent tools
              if (agent.activeToolNames.get(completedToolId) === "Task") {
                agent.activeSubagentToolIds.delete(completedToolId);
                agent.activeSubagentToolNames.delete(completedToolId);
                emitter.emit("subagentClear", {
                  id: agentId,
                  parentToolId: completedToolId,
                });
              }

              agent.activeToolIds.delete(completedToolId);
              agent.activeToolStatuses.delete(completedToolId);
              agent.activeToolNames.delete(completedToolId);

              const toolId = completedToolId;
              setTimeout(() => {
                emitter.emit("agentToolDone", { id: agentId, toolId });
              }, TOOL_DONE_DELAY_MS);
            }
          }

          // All tools completed -- allow text-idle timer as fallback
          if (agent.activeToolIds.size === 0) {
            agent.hadToolsInTurn = false;
          }
        } else {
          // New user text prompt -- new turn starting
          cancelTimer(agentId, waitingTimers);
          clearAgentActivity(agent, agentId, permissionTimers, emitter);
          agent.hadToolsInTurn = false;
        }
      } else if (typeof content === "string" && content.trim()) {
        // New user text prompt -- new turn starting
        cancelTimer(agentId, waitingTimers);
        clearAgentActivity(agent, agentId, permissionTimers, emitter);
        agent.hadToolsInTurn = false;
      }
    } else if (
      record.type === "system" &&
      record.subtype === "turn_duration"
    ) {
      cancelTimer(agentId, waitingTimers);
      cancelTimer(agentId, permissionTimers);

      // Definitive turn-end: clean up any stale tool state
      if (agent.activeToolIds.size > 0) {
        agent.activeToolIds.clear();
        agent.activeToolStatuses.clear();
        agent.activeToolNames.clear();
        agent.activeSubagentToolIds.clear();
        agent.activeSubagentToolNames.clear();
        emitter.emit("agentToolsClear", { id: agentId });
      }

      agent.isWaiting = true;
      agent.permissionSent = false;
      agent.hadToolsInTurn = false;
      emitter.emit("agentStatus", { id: agentId, status: "waiting" });
    }
  } catch {
    // Ignore malformed JSON lines
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a fresh AgentSession with all tracking state initialised. */
export function createAgentSession(
  id: number,
  projectDir: string,
  jsonlFile: string,
  folderName?: string,
): AgentSession {
  return {
    id,
    projectDir,
    jsonlFile,
    fileOffset: 0,
    lineBuffer: "",
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    folderName,
  };
}

/** Determine whether a tool name represents a read-only operation. */
export function isReadingTool(toolName: string): boolean {
  return READING_TOOLS.has(toolName);
}
