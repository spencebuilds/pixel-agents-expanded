import { TileType } from "../../shared/types";
import type { TileType as TileTypeVal, OfficeLayout, FloorColor } from "../../shared/types";
import {
  TILE_SIZE,
  WALL_COLOR,
  FLOOR_1_COLOR,
  FLOOR_2_COLOR,
  FLOOR_3_COLOR,
  FLOOR_4_COLOR,
  FLOOR_5_COLOR,
  FLOOR_6_COLOR,
  FLOOR_7_COLOR,
  CHARACTER_Z_SORT_OFFSET,
} from "./constants";

// ── Tile colour mapping ──────────────────────────────────────

/** Map a TileType value to a placeholder fill colour. */
function tileColor(tile: TileTypeVal): string | null {
  switch (tile) {
    case TileType.WALL:
      return WALL_COLOR;
    case TileType.FLOOR_1:
      return FLOOR_1_COLOR;
    case TileType.FLOOR_2:
      return FLOOR_2_COLOR;
    case TileType.FLOOR_3:
      return FLOOR_3_COLOR;
    case TileType.FLOOR_4:
      return FLOOR_4_COLOR;
    case TileType.FLOOR_5:
      return FLOOR_5_COLOR;
    case TileType.FLOOR_6:
      return FLOOR_6_COLOR;
    case TileType.FLOOR_7:
      return FLOOR_7_COLOR;
    case TileType.VOID:
    default:
      return null; // transparent
  }
}

// ── Layout helpers ───────────────────────────────────────────

/** Convert the flat `tiles` array in an OfficeLayout into a 2-D tile map. */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
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

// ── Z-sortable draw item ─────────────────────────────────────

interface ZDrawable {
  /** Y coordinate used for depth-sorting (lower = further back). */
  zY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

// ── Entity interface (for future characters / furniture) ─────

export interface RenderEntity {
  /** World-space X position (pixels, not tiles). */
  x: number;
  /** World-space Y position (pixels, not tiles). */
  y: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Fill colour for the placeholder rectangle. */
  color: string;
}

// ── Core render functions ────────────────────────────────────

/**
 * Render the tile grid (floor + walls) using placeholder colours.
 */
export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  _tileColors?: Array<FloorColor | null>,
): void {
  const s = TILE_SIZE * zoom;
  const tmRows = tileMap.length;
  const tmCols = tmRows > 0 ? tileMap[0].length : 0;

  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      const tile = tileMap[r][c];
      const color = tileColor(tile);
      if (color === null) continue; // VOID — skip
      ctx.fillStyle = color;
      ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s);
    }
  }
}

/**
 * Render entities with z-sorting (by bottom-edge Y coordinate).
 * Currently renders placeholder rectangles; will render sprites later.
 */
export function renderEntities(
  ctx: CanvasRenderingContext2D,
  entities: RenderEntity[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const drawables: ZDrawable[] = [];

  for (const entity of entities) {
    const ex = offsetX + entity.x * zoom;
    const ey = offsetY + entity.y * zoom;
    const ew = entity.width * zoom;
    const eh = entity.height * zoom;
    const zY = entity.y + entity.height + CHARACTER_Z_SORT_OFFSET;

    drawables.push({
      zY,
      draw: (c) => {
        c.fillStyle = entity.color;
        c.fillRect(ex, ey, ew, eh);
      },
    });
  }

  // Sort ascending by Y — items further back are drawn first
  drawables.sort((a, b) => a.zY - b.zY);

  for (const d of drawables) {
    d.draw(ctx);
  }
}

/**
 * Top-level render function.
 *
 * Clears the canvas, centres the tile map, renders floor/wall tiles,
 * then z-sorts and renders any entities (furniture, characters).
 */
export function render(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  layout: OfficeLayout,
  tileMap: TileTypeVal[][],
  entities: RenderEntity[],
  zoom: number,
): void {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const cols = layout.cols;
  const rows = layout.rows;

  // Centre the map in the viewport (integer pixels to avoid sub-pixel blurring)
  const mapW = cols * TILE_SIZE * zoom;
  const mapH = rows * TILE_SIZE * zoom;
  const offsetX = Math.floor((canvasWidth - mapW) / 2);
  const offsetY = Math.floor((canvasHeight - mapH) / 2);

  // Draw floor and wall tiles
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, layout.tileColors);

  // Draw entities with z-sorting
  renderEntities(ctx, entities, offsetX, offsetY, zoom);
}
