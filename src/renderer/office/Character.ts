/**
 * Character entity: position, rendering, animation frame cycling.
 *
 * Ported from pixel-agents-reference/webview-ui/src/office/engine/characters.ts
 * combined with renderer.ts character-drawing logic.
 */

import type { Direction } from "../../shared/types";
import { CharacterState, Direction as Dir } from "../../shared/types";
import type { SpriteData } from "./colorize";
import type { CharacterSprites } from "./sprites/spriteData";
import { getCharacterSprites } from "./sprites/spriteData";
import { getCachedSprite } from "./sprites/spriteCache";
import {
  TILE_SIZE,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
} from "./constants";

// ── Character interface ──────────────────────────────────────

export interface Character {
  id: number;
  state: CharacterState;
  dir: Direction;
  /** Pixel position (world space, center of character) */
  x: number;
  y: number;
  /** Current tile column */
  tileCol: number;
  /** Current tile row */
  tileRow: number;
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>;
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number;
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null;
  /** Palette index (0-5) */
  palette: number;
  /** Hue shift in degrees (0 = no shift) */
  hueShift: number;
  /** Animation frame index */
  frame: number;
  /** Time accumulator for animation */
  frameTimer: number;
  /** Timer for idle wander decisions */
  wanderTimer: number;
  /** Number of wander moves completed in current roaming cycle */
  wanderCount: number;
  /** Max wander moves before returning to seat for rest */
  wanderLimit: number;
  /** Whether the agent is actively working */
  isActive: boolean;
  /** Assigned seat uid, or null if no seat */
  seatId: string | null;
  /** Timer to stay seated while inactive (counts down to 0) */
  seatTimer: number;
}

// ── Factory ──────────────────────────────────────────────────

/** Pixel center of a tile */
export function tileCenter(
  col: number,
  row: number,
): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Create a new Character entity at a given tile position */
export function createCharacter(
  id: number,
  palette: number,
  col: number,
  row: number,
  dir: Direction = Dir.DOWN,
  hueShift = 0,
): Character {
  const center = tileCenter(col, row);
  return {
    id,
    state: CharacterState.IDLE,
    dir,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 2 + Math.random() * 18,
    wanderCount: 0,
    wanderLimit: 3 + Math.floor(Math.random() * 4),
    isActive: false,
    seatId: null,
    seatTimer: 0,
  };
}

// ── Sprite selection ─────────────────────────────────────────

/** Tools that show reading animation instead of typing */
const READING_TOOLS = new Set([
  "Read",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
]);

export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false;
  return READING_TOOLS.has(tool);
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(
  ch: Character,
  sprites: CharacterSprites,
): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        return sprites.reading[ch.dir][ch.frame % 2];
      }
      return sprites.typing[ch.dir][ch.frame % 2];
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4];
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1]; // standing frame
    default:
      return sprites.walk[ch.dir][1];
  }
}

// ── Rendering ────────────────────────────────────────────────

/**
 * Draw a character onto a canvas context.
 *
 * Uses the sprite cache for efficient pixel-art rendering.
 * Character is anchored at bottom-center of its pixel position.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const sprites = getCharacterSprites(ch.palette, ch.hueShift);
  const spriteData = getCharacterSprite(ch, sprites);
  const cached = getCachedSprite(spriteData, zoom);

  // Sitting offset: shift character down when seated
  const sittingOffset =
    ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;

  // Anchor at bottom-center of character, rounded for crisp pixels
  const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
  const drawY = Math.round(
    offsetY + (ch.y + sittingOffset) * zoom - cached.height,
  );

  ctx.drawImage(cached, drawX, drawY);
}

/**
 * Get the z-sort Y value for a character (for depth ordering).
 * Lower values are drawn first (further back).
 */
export function characterZY(ch: Character): number {
  return ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;
}
