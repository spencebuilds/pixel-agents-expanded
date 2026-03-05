// ─── Agent types ─────────────────────────────────────────────────────────────

/** High-level agent activity state visible to the renderer. */
export type AgentState = "idle" | "active" | "waiting" | "typing" | "reading";

/** An agent as seen by the renderer (serialisable over IPC). */
export interface Agent {
  id: number;
  name: string;
  state: AgentState;
  /** Currently active tool name, if any. */
  currentTool?: string;
  /** Path to the JSONL session file being tailed. */
  sessionFile?: string;
  /** Palette index (0-5) used for character colouring. */
  paletteIndex: number;
  /** Workspace folder name (only set for multi-root workspaces). */
  folderName?: string;
}

/** Payload pushed from main → renderer when agent state changes. */
export interface AgentUpdate {
  agents: Agent[];
}

// ─── Office layout types ─────────────────────────────────────────────────────

/** Tile type enum (const-object pattern for compatibility with both CJS and ESM). */
export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  VOID: 8,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

/** Per-tile colour settings for floor pattern colourisation. */
export interface FloorColor {
  h: number;
  s: number;
  b: number;
  c: number;
  colorize?: boolean;
}

/** A piece of furniture placed in the office. */
export interface PlacedFurniture {
  uid: string;
  type: string;
  col: number;
  row: number;
  color?: FloorColor;
}

/** Serialisable office layout. */
export interface OfficeLayout {
  version: 1;
  cols: number;
  rows: number;
  tiles: TileType[];
  furniture: PlacedFurniture[];
  /** Per-tile colour settings, parallel to `tiles`. null = wall/no colour. */
  tileColors?: Array<FloorColor | null>;
}

/** Cardinal direction (const-object pattern). */
export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** A seat derived from chair furniture. */
export interface Seat {
  uid: string;
  seatCol: number;
  seatRow: number;
  facingDir: Direction;
  assigned: boolean;
}

// ─── Transcript parser types ─────────────────────────────────────────────────

/** Internal state tracked per agent by the transcript parser (main-process only). */
export interface AgentSession {
  id: number;
  projectDir: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeToolNames: Map<string, string>;
  /** parentToolId -> active sub-tool IDs */
  activeSubagentToolIds: Map<string, Set<string>>;
  /** parentToolId -> (subToolId -> toolName) */
  activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  folderName?: string;
}

/** Events emitted by the transcript parser. */
export interface TranscriptEvents {
  agentStatus: { id: number; status: "active" | "waiting" };
  agentToolStart: { id: number; toolId: string; status: string };
  agentToolDone: { id: number; toolId: string };
  agentToolsClear: { id: number };
  agentToolPermission: { id: number };
  subagentToolStart: {
    id: number;
    parentToolId: string;
    toolId: string;
    status: string;
  };
  subagentToolDone: { id: number; parentToolId: string; toolId: string };
  subagentClear: { id: number; parentToolId: string };
  subagentToolPermission: { id: number; parentToolId: string };
}

// ─── IPC channel constants ───────────────────────────────────────────────────

/**
 * Centralised IPC channel names. Using a const object prevents magic strings
 * from drifting between main, preload, and renderer.
 */
export const IpcChannels = {
  /** Renderer → main: request current agent list (invoke/handle). */
  GET_AGENTS: "get-agents",
  /** Main → renderer: push agent state updates (send/on). */
  AGENT_UPDATE: "agent-update",
  /** Main → renderer: push loaded asset data (send/on). */
  ASSETS_LOADED: "assets-loaded",
} as const;

// ─── Preload API type ────────────────────────────────────────────────────────

/** Shape of the API exposed to the renderer via contextBridge. */
export interface PixelAgentsApi {
  /** Request the current list of agents from the main process. */
  getAgents(): Promise<Agent[]>;
  /** Subscribe to agent state updates pushed from the main process. */
  onAgentUpdate(callback: (update: AgentUpdate) => void): () => void;
  /** Subscribe to asset data pushed from the main process. */
  onAssetsLoaded(callback: (assets: unknown) => void): () => void;
}
