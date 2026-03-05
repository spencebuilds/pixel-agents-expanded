/**
 * Desk / seat assignment manager.
 *
 * Extracts seats from the office layout and assigns agents to available desks.
 * Integrates with pathfinding to provide target positions for characters.
 */

import type { OfficeLayout, Seat, Direction as DirectionType } from "../../shared/types";
import { Direction } from "../../shared/types";

// ── Seat extraction ──────────────────────────────────────────

/**
 * Extract seats from the office layout's furniture list.
 *
 * In the full reference implementation, seats are derived from chair
 * furniture entries. For our simplified layout (which may not yet have
 * furniture), we generate a set of default seat positions from floor tiles.
 *
 * Returns a Map of seatUid → Seat.
 */
export function extractSeats(layout: OfficeLayout): Map<string, Seat> {
  const seats = new Map<string, Seat>();

  // If the layout has furniture with chairs, extract seats from those
  for (const item of layout.furniture) {
    // Check for chair-type furniture (types containing "chair")
    if (item.type.toLowerCase().includes("chair")) {
      const seat: Seat = {
        uid: item.uid,
        seatCol: item.col,
        seatRow: item.row,
        facingDir: Direction.UP, // default facing for chairs
        assigned: false,
      };
      seats.set(item.uid, seat);
    }
  }

  // If no furniture-based seats, generate default desk positions along the interior
  if (seats.size === 0) {
    const defaultPositions = getDefaultSeatPositions(layout);
    for (const pos of defaultPositions) {
      const uid = `seat-${pos.col}-${pos.row}`;
      seats.set(uid, {
        uid,
        seatCol: pos.col,
        seatRow: pos.row,
        facingDir: pos.facingDir,
        assigned: false,
      });
    }
  }

  return seats;
}

/** Generate default desk/seat positions for a basic layout without furniture. */
function getDefaultSeatPositions(
  layout: OfficeLayout,
): Array<{ col: number; row: number; facingDir: DirectionType }> {
  const positions: Array<{
    col: number;
    row: number;
    facingDir: DirectionType;
  }> = [];
  const { cols, rows } = layout;

  // Place seats in a grid pattern in the interior, spaced 3 tiles apart
  // Facing direction alternates to simulate rows of desks
  for (let r = 2; r < rows - 2; r += 3) {
    for (let c = 2; c < cols - 2; c += 3) {
      const facingDir = r % 2 === 0 ? Direction.DOWN : Direction.UP;
      positions.push({ col: c, row: r, facingDir });
    }
  }

  return positions;
}

// ── DeskManager class ────────────────────────────────────────

export class DeskManager {
  private seats: Map<string, Seat>;
  /** agentId → seatUid */
  private assignments: Map<number, string> = new Map();

  constructor(layout: OfficeLayout) {
    this.seats = extractSeats(layout);
  }

  /** Re-extract seats from a new layout, preserving existing assignments where possible. */
  rebuildFromLayout(layout: OfficeLayout): void {
    const newSeats = extractSeats(layout);

    // Preserve existing assignments if the seat still exists in the new layout
    const newAssignments = new Map<number, string>();
    for (const [agentId, seatUid] of this.assignments) {
      if (newSeats.has(seatUid)) {
        newSeats.get(seatUid)!.assigned = true;
        newAssignments.set(agentId, seatUid);
      }
    }

    this.seats = newSeats;
    this.assignments = newAssignments;
  }

  /** Get all seats. */
  getAllSeats(): Map<string, Seat> {
    return this.seats;
  }

  /** Assign the first available seat to an agent. Returns the Seat or null. */
  assignSeat(agentId: number): Seat | null {
    // If agent already has a seat, return it
    const existingUid = this.assignments.get(agentId);
    if (existingUid) {
      return this.seats.get(existingUid) ?? null;
    }

    // Find first unassigned seat
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) {
        seat.assigned = true;
        this.assignments.set(agentId, uid);
        return seat;
      }
    }

    return null;
  }

  /** Release a seat occupied by the given agent. */
  releaseSeat(agentId: number): void {
    const uid = this.assignments.get(agentId);
    if (uid) {
      const seat = this.seats.get(uid);
      if (seat) {
        seat.assigned = false;
      }
      this.assignments.delete(agentId);
    }
  }

  /** Get the seat assigned to an agent, or null. */
  getSeatForAgent(agentId: number): Seat | null {
    const uid = this.assignments.get(agentId);
    if (!uid) return null;
    return this.seats.get(uid) ?? null;
  }

  /** Get the seat uid assigned to an agent, or null. */
  getSeatIdForAgent(agentId: number): string | null {
    return this.assignments.get(agentId) ?? null;
  }

  /** Check whether a specific seat is occupied. */
  isSeatOccupied(seatUid: string): boolean {
    const seat = this.seats.get(seatUid);
    return seat ? seat.assigned : false;
  }

  /** Count of total seats. */
  totalSeats(): number {
    return this.seats.size;
  }

  /** Count of available (unassigned) seats. */
  availableSeats(): number {
    let count = 0;
    for (const seat of this.seats.values()) {
      if (!seat.assigned) count++;
    }
    return count;
  }
}
