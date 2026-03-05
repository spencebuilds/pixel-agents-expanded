/**
 * BFS pathfinding on a 4-connected tile grid (no diagonals).
 *
 * Ported from pixel-agents-reference/webview-ui/src/office/layout/tileMap.ts
 */

import { TileType } from "../../shared/types";
import type { TileType as TileTypeVal, OfficeLayout } from "../../shared/types";

// ── Walkability ──────────────────────────────────────────────

/** Check if a tile is walkable (floor types are walkable; walls, void, and blocked tiles are not). */
export function isWalkable(
  col: number,
  row: number,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): boolean {
  const rows = tileMap.length;
  const cols = rows > 0 ? tileMap[0].length : 0;
  if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
  const t = tileMap[row][col];
  if (t === TileType.WALL || t === TileType.VOID) return false;
  if (blockedTiles.has(`${col},${row}`)) return false;
  return true;
}

// ── Walkable tile enumeration ────────────────────────────────

/** Get all walkable tile positions (grid coords) for wander targets. */
export function getWalkableTiles(
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): Array<{ col: number; row: number }> {
  const rows = tileMap.length;
  const cols = rows > 0 ? tileMap[0].length : 0;
  const tiles: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isWalkable(c, r, tileMap, blockedTiles)) {
        tiles.push({ col: c, row: r });
      }
    }
  }
  return tiles;
}

/**
 * Convenience: extract walkable tiles directly from an OfficeLayout
 * (converts layout to tileMap internally, uses an empty blocked set).
 */
export function getWalkableTilesFromLayout(
  layout: OfficeLayout,
): Array<{ col: number; row: number }> {
  const tileMap = layoutToTileMap2D(layout);
  return getWalkableTiles(tileMap, new Set());
}

/** Convert flat tile array to 2D grid. */
export function layoutToTileMap2D(layout: OfficeLayout): TileTypeVal[][] {
  const { cols, rows, tiles } = layout;
  const map: TileTypeVal[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TileTypeVal[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(tiles[r * cols + c] ?? TileType.VOID);
    }
    map.push(row);
  }
  return map;
}

// ── BFS pathfinding ──────────────────────────────────────────

/**
 * BFS pathfinding on a 4-connected grid (no diagonals).
 * Returns path excluding start position, including end position.
 * Returns empty array if start === end or no path exists.
 */
export function findPath(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): Array<{ col: number; row: number }> {
  if (startCol === endCol && startRow === endRow) return [];

  const key = (c: number, r: number) => `${c},${r}`;
  const startKey = key(startCol, startRow);
  const endKey = key(endCol, endRow);

  // End must be walkable
  if (!isWalkable(endCol, endRow, tileMap, blockedTiles)) {
    return [];
  }

  const visited = new Set<string>();
  visited.add(startKey);

  const parent = new Map<string, string>();
  const queue: Array<{ col: number; row: number }> = [
    { col: startCol, row: startRow },
  ];

  const dirs = [
    { dc: 0, dr: -1 }, // up
    { dc: 0, dr: 1 }, // down
    { dc: -1, dr: 0 }, // left
    { dc: 1, dr: 0 }, // right
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currKey = key(curr.col, curr.row);

    if (currKey === endKey) {
      // Reconstruct path
      const path: Array<{ col: number; row: number }> = [];
      let k = endKey;
      while (k !== startKey) {
        const [c, r] = k.split(",").map(Number);
        path.unshift({ col: c, row: r });
        k = parent.get(k)!;
      }
      return path;
    }

    for (const d of dirs) {
      const nc = curr.col + d.dc;
      const nr = curr.row + d.dr;
      const nk = key(nc, nr);

      if (visited.has(nk)) continue;
      if (!isWalkable(nc, nr, tileMap, blockedTiles)) continue;

      visited.add(nk);
      parent.set(nk, currKey);
      queue.push({ col: nc, row: nr });
    }
  }

  // No path found
  return [];
}
