/**
 * Character state machine: IDLE, WALK, TYPE transitions.
 *
 * Ported from pixel-agents-reference/webview-ui/src/office/engine/characters.ts
 *
 * State transitions:
 * - IDLE: standing still, frame 1 of walk. Wander timer counts down.
 * - WALK: moving along a path, cycling 4 walk frames. Transitions to
 *   TYPE (reached seat + agent active) or IDLE (reached idle location).
 * - TYPE: sitting at desk, cycling typing/reading frames. Transitions
 *   to IDLE when agent becomes inactive (after seatTimer expires).
 */

import type { Character } from "./Character";
import { tileCenter } from "./Character";
import { CharacterState, Direction } from "../../shared/types";
import {
  TILE_SIZE,
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  WANDER_PAUSE_MIN_SEC,
  WANDER_PAUSE_MAX_SEC,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_MOVES_BEFORE_REST_MAX,
  SEAT_REST_MIN_SEC,
  SEAT_REST_MAX_SEC,
} from "./constants";

// ── Helpers ──────────────────────────────────────────────────

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
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

// ── State machine update ─────────────────────────────────────

/**
 * Advance a character's state machine and animation by dt seconds.
 *
 * This is a simplified version without pathfinding (no walkable tiles
 * or tile map). Characters will cycle through their current state's
 * animation frames, and transition between states based on timers
 * and the isActive flag.
 *
 * For full pathfinding-based wander and seat-seeking, the caller
 * should provide walkable tiles and a findPath implementation
 * (to be added in the pathfinding chunk).
 */
export function updateCharacter(ch: Character, dt: number): void {
  ch.frameTimer += dt;

  switch (ch.state) {
    case CharacterState.TYPE: {
      // Cycle typing/reading frames
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }

      // If no longer active, stand up after seatTimer expires
      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt;
          break;
        }
        ch.seatTimer = 0;
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(
          WANDER_PAUSE_MIN_SEC,
          WANDER_PAUSE_MAX_SEC,
        );
        ch.wanderCount = 0;
        ch.wanderLimit = randomInt(
          WANDER_MOVES_BEFORE_REST_MIN,
          WANDER_MOVES_BEFORE_REST_MAX,
        );
      }
      break;
    }

    case CharacterState.IDLE: {
      // No idle animation -- static standing pose (walk frame 1)
      ch.frame = 0;

      // If became active, transition to TYPE (simplified: no pathfinding yet)
      if (ch.isActive) {
        ch.state = CharacterState.TYPE;
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }

      // Countdown wander timer (wander path selection requires pathfinding,
      // so for now we just reset the timer)
      ch.wanderTimer -= dt;
      if (ch.wanderTimer <= 0) {
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
        // Path complete -- snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;

        if (ch.isActive) {
          ch.state = CharacterState.TYPE;
        } else {
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = randomRange(
            WANDER_PAUSE_MIN_SEC,
            WANDER_PAUSE_MAX_SEC,
          );
        }
        ch.frame = 0;
        ch.frameTimer = 0;
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
        // Arrived at next tile
        ch.tileCol = nextTile.col;
        ch.tileRow = nextTile.row;
        ch.x = toCenter.x;
        ch.y = toCenter.y;
        ch.path.shift();
        ch.moveProgress = 0;
      }
      break;
    }
  }
}
