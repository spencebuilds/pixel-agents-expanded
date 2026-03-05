import { useEffect, useRef, useCallback } from "react";
import { startGameLoop } from "../office/GameLoop";
import { render, layoutToTileMap } from "../office/OfficeRenderer";
import type { RenderEntity } from "../office/OfficeRenderer";
import { TILE_SIZE, ZOOM_DEFAULT } from "../office/constants";
import { TileType, CharacterState } from "../../shared/types";
import type { OfficeLayout, TileType as TileTypeVal } from "../../shared/types";
import type { Character } from "../office/Character";
import { createCharacter, drawCharacter } from "../office/Character";
import { updateCharacter } from "../office/CharacterState";

// ── Default layout (simple 11x11 office) ─────────────────────

function createDefaultLayout(): OfficeLayout {
  const cols = 11;
  const rows = 11;
  const tiles: TileTypeVal[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      if (isEdge) {
        tiles.push(TileType.WALL);
      } else {
        // Alternate between floor patterns for visual variety
        const pattern = ((r + c) % 2 === 0) ? TileType.FLOOR_1 : TileType.FLOOR_2;
        tiles.push(pattern);
      }
    }
  }

  return {
    version: 1,
    cols,
    rows,
    tiles,
    furniture: [],
  };
}

// ── OfficeCanvas component ───────────────────────────────────

export default function OfficeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store mutable state in refs so the game loop closure stays up to date
  const layoutRef = useRef<OfficeLayout>(createDefaultLayout());
  const tileMapRef = useRef<TileTypeVal[][]>(layoutToTileMap(layoutRef.current));
  const entitiesRef = useRef<RenderEntity[]>([]);
  const zoomRef = useRef(ZOOM_DEFAULT);

  // Test characters: one typing (active), one idle, one walking
  const charactersRef = useRef<Character[]>(() => {
    const typing = createCharacter(1, 0, 3, 3);
    typing.isActive = true;
    typing.state = CharacterState.TYPE;

    const idle = createCharacter(2, 1, 7, 5);

    const walking = createCharacter(3, 2, 5, 3);
    walking.state = CharacterState.WALK;
    walking.path = [
      { col: 6, row: 3 },
      { col: 7, row: 3 },
      { col: 7, row: 4 },
      { col: 7, row: 5 },
      { col: 7, row: 6 },
      { col: 6, row: 6 },
      { col: 5, row: 6 },
      { col: 5, row: 5 },
      { col: 5, row: 4 },
      { col: 5, row: 3 },
    ];

    return [typing, idle, walking];
  });

  /** Resize the canvas to fill its container at the correct device pixel ratio. */
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Size the backing store to match physical pixels
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    // Size the element to match CSS pixels
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // Scale the drawing context so 1 unit = 1 CSS pixel
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial sizing
    resizeCanvas();

    // Observe container resizes
    const container = containerRef.current;
    let resizeObserver: ResizeObserver | undefined;
    if (container) {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(container);
    }

    // Calculate zoom to best fit the layout
    const computeZoom = () => {
      if (!container) return ZOOM_DEFAULT;
      const rect = container.getBoundingClientRect();
      const layout = layoutRef.current;
      const mapW = layout.cols * TILE_SIZE;
      const mapH = layout.rows * TILE_SIZE;
      // Fit the map with some padding (80% of container)
      const scaleX = (rect.width * 0.8) / mapW;
      const scaleY = (rect.height * 0.8) / mapH;
      const idealZoom = Math.min(scaleX, scaleY);
      // Use an integer zoom for crisp pixel art
      return Math.max(1, Math.floor(idealZoom));
    };

    zoomRef.current = computeZoom();

    // Start the game loop
    const stopLoop = startGameLoop(canvas, {
      update: (dt: number) => {
        // Update all test characters
        for (const ch of charactersRef.current) {
          updateCharacter(ch, dt);

          // Loop the walking character back when path is exhausted
          if (ch.id === 3 && ch.state !== CharacterState.WALK) {
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.path = [
              { col: 6, row: 3 },
              { col: 7, row: 3 },
              { col: 7, row: 4 },
              { col: 7, row: 5 },
              { col: 7, row: 6 },
              { col: 6, row: 6 },
              { col: 5, row: 6 },
              { col: 5, row: 5 },
              { col: 5, row: 4 },
              { col: 5, row: 3 },
            ];
          }
        }
      },
      render: (ctx: CanvasRenderingContext2D) => {
        const c = canvasRef.current;
        if (!c) return;
        const container2 = containerRef.current;
        if (!container2) return;
        const rect = container2.getBoundingClientRect();

        render(
          ctx,
          rect.width,
          rect.height,
          layoutRef.current,
          tileMapRef.current,
          entitiesRef.current,
          zoomRef.current,
        );

        // Draw characters on top of the tile grid
        const layout = layoutRef.current;
        const zoom = zoomRef.current;
        const mapW = layout.cols * TILE_SIZE * zoom;
        const mapH = layout.rows * TILE_SIZE * zoom;
        const offsetX = Math.floor((rect.width - mapW) / 2);
        const offsetY = Math.floor((rect.height - mapH) / 2);

        for (const ch of charactersRef.current) {
          drawCharacter(ctx, ch, offsetX, offsetY, zoom);
        }
      },
    });

    return () => {
      stopLoop();
      resizeObserver?.disconnect();
    };
  }, [resizeCanvas]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
