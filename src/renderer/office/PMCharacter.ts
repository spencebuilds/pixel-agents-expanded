/**
 * Product Manager character — always-present NPC that wanders the office
 * and periodically displays humorous PM speech bubbles.
 *
 * The PM character uses a reserved palette index and is not tied to any
 * Claude Code session. It autonomously wanders between walkable tiles
 * and shows random speech lines on a timer.
 */

import type { Character } from "./Character";
import { createCharacter, tileCenter } from "./Character";
import { CharacterState, Direction } from "../../shared/types";
import type { TileType as TileTypeVal } from "../../shared/types";
import { findPath } from "./Pathfinding";
import {
  TILE_SIZE,
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  WANDER_PAUSE_MIN_SEC,
  WANDER_PAUSE_MAX_SEC,
} from "./constants";

// ── PM configuration ─────────────────────────────────────────

/** Reserved agent ID for the PM character (negative to avoid collisions). */
export const PM_AGENT_ID = -999;

/** Reserved palette index for the PM character. */
export const PM_PALETTE = 5;

/** Hue shift to visually distinguish the PM from normal agents. */
export const PM_HUE_SHIFT = 180;

/** Minimum seconds between speech bubbles. */
const SPEECH_INTERVAL_MIN_SEC = 30;

/** Maximum seconds between speech bubbles. */
const SPEECH_INTERVAL_MAX_SEC = 90;

/** How long a speech bubble stays visible (seconds). */
const SPEECH_BUBBLE_DURATION_SEC = 4.0;

/** Fade-out duration at the end of a speech bubble's life (seconds). */
const SPEECH_BUBBLE_FADE_SEC = 0.5;

// ── Speech lines ─────────────────────────────────────────────

const PM_SPEECH_LINES: readonly string[] = [
  "Let's circle back on that",
  "Can we make it pop more?",
  "What's the ETA on that?",
  "Let's take this offline",
  "I updated the Jira board",
  "Can we add AI to this?",
  "Per my last email...",
  "Let's sync on that",
  "I'll set up a meeting to discuss",
  "Have we considered the user journey?",
  "Can we get metrics on that?",
  "This needs more story points",
  "Let's put a pin in that",
  "Ya let's scrap that, this is the new priority",
];

// ── PM speech bubble state ───────────────────────────────────

export interface PMSpeechBubble {
  text: string;
  /** Remaining time the bubble is visible (counts down). */
  timer: number;
  /** Current opacity (1.0 = fully visible, fades near end). */
  opacity: number;
}

// ── PM Character class ───────────────────────────────────────

export class PMCharacter {
  character: Character;
  /** Timer until the next speech bubble fires. */
  private speechTimer: number;
  /** Currently active speech bubble, or null. */
  speechBubble: PMSpeechBubble | null = null;

  constructor(spawnCol: number, spawnRow: number) {
    this.character = createCharacter(
      PM_AGENT_ID,
      PM_PALETTE,
      spawnCol,
      spawnRow,
      Direction.DOWN,
      PM_HUE_SHIFT,
    );
    // PM starts idle and wanders immediately
    this.character.isActive = false;
    this.character.state = CharacterState.IDLE;
    this.character.wanderTimer = randomRange(
      WANDER_PAUSE_MIN_SEC,
      WANDER_PAUSE_MAX_SEC,
    );

    // Schedule first speech bubble
    this.speechTimer = randomRange(
      SPEECH_INTERVAL_MIN_SEC / 3, // First one comes a bit sooner
      SPEECH_INTERVAL_MAX_SEC / 2,
    );
  }

  /**
   * Update the PM character: handle wandering, pathfinding, and speech bubbles.
   *
   * This is called each frame from the game loop.
   */
  update(
    dt: number,
    walkableTiles: Array<{ col: number; row: number }>,
    tileMap: TileTypeVal[][],
    blockedTiles: Set<string>,
  ): void {
    const ch = this.character;
    ch.frameTimer += dt;

    // ── Update speech bubble ──────────────────────────────────
    this.updateSpeechBubble(dt);

    // ── State machine ─────────────────────────────────────────
    switch (ch.state) {
      case CharacterState.IDLE: {
        ch.frame = 0;

        // Countdown wander timer
        ch.wanderTimer -= dt;
        if (ch.wanderTimer <= 0) {
          // Pick a random walkable tile and path to it
          if (walkableTiles.length > 0) {
            const target =
              walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              target.col,
              target.row,
              tileMap,
              blockedTiles,
            );
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              ch.frame = 0;
              ch.frameTimer = 0;
            }
          }
          ch.wanderTimer = randomRange(
            WANDER_PAUSE_MIN_SEC,
            WANDER_PAUSE_MAX_SEC,
          );
        }
        break;
      }

      case CharacterState.WALK: {
        // Walk animation: cycle 4 frames
        if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
          ch.frameTimer -= WALK_FRAME_DURATION_SEC;
          ch.frame = (ch.frame + 1) % 4;
        }

        if (ch.path.length === 0) {
          // Path complete -- snap to tile center and go idle
          const center = tileCenter(ch.tileCol, ch.tileRow);
          ch.x = center.x;
          ch.y = center.y;
          ch.state = CharacterState.IDLE;
          ch.frame = 0;
          ch.frameTimer = 0;
          ch.wanderTimer = randomRange(
            WANDER_PAUSE_MIN_SEC,
            WANDER_PAUSE_MAX_SEC,
          );
          break;
        }

        // Move toward next tile in path
        const nextTile = ch.path[0];
        ch.dir = directionBetween(
          ch.tileCol,
          ch.tileRow,
          nextTile.col,
          nextTile.row,
        );

        ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;

        const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
        const toCenter = tileCenter(nextTile.col, nextTile.row);
        const t = Math.min(ch.moveProgress, 1);
        ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
        ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

        if (ch.moveProgress >= 1) {
          ch.tileCol = nextTile.col;
          ch.tileRow = nextTile.row;
          ch.x = toCenter.x;
          ch.y = toCenter.y;
          ch.path.shift();
          ch.moveProgress = 0;
        }
        break;
      }

      case CharacterState.TYPE: {
        // PM shouldn't normally be typing, transition back to idle
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(
          WANDER_PAUSE_MIN_SEC,
          WANDER_PAUSE_MAX_SEC,
        );
        break;
      }
    }
  }

  /** Update the speech bubble timer and trigger new bubbles. */
  private updateSpeechBubble(dt: number): void {
    // Tick down active bubble
    if (this.speechBubble) {
      this.speechBubble.timer -= dt;
      // Compute opacity: fade out during the last SPEECH_BUBBLE_FADE_SEC
      if (this.speechBubble.timer <= SPEECH_BUBBLE_FADE_SEC) {
        this.speechBubble.opacity = Math.max(
          0,
          this.speechBubble.timer / SPEECH_BUBBLE_FADE_SEC,
        );
      } else {
        this.speechBubble.opacity = 1.0;
      }
      if (this.speechBubble.timer <= 0) {
        this.speechBubble = null;
      }
    }

    // Tick speech interval timer
    this.speechTimer -= dt;
    if (this.speechTimer <= 0 && !this.speechBubble) {
      // Show a new speech bubble
      const line =
        PM_SPEECH_LINES[Math.floor(Math.random() * PM_SPEECH_LINES.length)];
      this.speechBubble = {
        text: line,
        timer: SPEECH_BUBBLE_DURATION_SEC,
        opacity: 1.0,
      };
      // Schedule next bubble
      this.speechTimer = randomRange(
        SPEECH_INTERVAL_MIN_SEC,
        SPEECH_INTERVAL_MAX_SEC,
      );
    }
  }

  /** Get the current character (for drawing via the normal character renderer). */
  getCharacter(): Character {
    return this.character;
  }
}

// ── Rendering: speech bubble ─────────────────────────────────

/**
 * Draw a speech bubble above a character.
 *
 * Renders a white rounded rectangle with the speech text, positioned
 * above the character sprite. Includes a small triangular pointer.
 */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  bubble: PMSpeechBubble,
  charX: number,
  charY: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (bubble.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = bubble.opacity;

  // Position above the character
  const screenX = offsetX + charX * zoom;
  const screenY = offsetY + charY * zoom;

  // Measure text
  const fontSize = Math.max(8, Math.round(4 * zoom));
  ctx.font = `${fontSize}px monospace`;
  const metrics = ctx.measureText(bubble.text);
  const textWidth = metrics.width;
  const textHeight = fontSize;

  // Bubble dimensions
  const padX = 4 * zoom;
  const padY = 3 * zoom;
  const bubbleW = textWidth + padX * 2;
  const bubbleH = textHeight + padY * 2;
  const bubbleX = screenX - bubbleW / 2;
  const bubbleY = screenY - bubbleH - 12 * zoom; // above the character head
  const pointerSize = 3 * zoom;

  // Draw bubble background
  const radius = 3 * zoom;
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = Math.max(1, zoom * 0.5);

  // Rounded rectangle
  ctx.beginPath();
  ctx.moveTo(bubbleX + radius, bubbleY);
  ctx.lineTo(bubbleX + bubbleW - radius, bubbleY);
  ctx.arcTo(
    bubbleX + bubbleW,
    bubbleY,
    bubbleX + bubbleW,
    bubbleY + radius,
    radius,
  );
  ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - radius);
  ctx.arcTo(
    bubbleX + bubbleW,
    bubbleY + bubbleH,
    bubbleX + bubbleW - radius,
    bubbleY + bubbleH,
    radius,
  );
  ctx.lineTo(bubbleX + radius, bubbleY + bubbleH);
  ctx.arcTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - radius, radius);
  ctx.lineTo(bubbleX, bubbleY + radius);
  ctx.arcTo(bubbleX, bubbleY, bubbleX + radius, bubbleY, radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw pointer triangle below the bubble
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(screenX - pointerSize, bubbleY + bubbleH);
  ctx.lineTo(screenX + pointerSize, bubbleY + bubbleH);
  ctx.lineTo(screenX, bubbleY + bubbleH + pointerSize);
  ctx.closePath();
  ctx.fill();

  // Pointer border (left and right edges only)
  ctx.beginPath();
  ctx.moveTo(screenX - pointerSize, bubbleY + bubbleH - 0.5);
  ctx.lineTo(screenX, bubbleY + bubbleH + pointerSize);
  ctx.lineTo(screenX + pointerSize, bubbleY + bubbleH - 0.5);
  ctx.stroke();

  // Draw text
  ctx.fillStyle = "#333333";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bubble.text, screenX, bubbleY + bubbleH / 2);

  ctx.restore();
}

// ── Helpers ──────────────────────────────────────────────────

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Direction from one tile to an adjacent tile */
function directionBetween(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): (typeof Direction)[keyof typeof Direction] {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}
