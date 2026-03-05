/**
 * Asset Loader — main process module for loading bundled assets.
 *
 * Loads the default office layout and detects whether premium tileset
 * assets are available.  Results are sent to the renderer via IPC.
 */

import * as fs from "fs";
import * as path from "path";
import { BrowserWindow } from "electron";
import { IpcChannels } from "../shared/types";
import type { OfficeLayout } from "../shared/types";

// ── Asset metadata ──────────────────────────────────────────────

export interface AssetMetadata {
  /** Whether the premium tileset directory exists. */
  hasPremiumTileset: boolean;
  /** Resolved path to the assets directory. */
  assetsRoot: string;
}

// ── Resolve the assets directory ────────────────────────────────

/**
 * Determine the root path of the bundled `assets/` directory.
 *
 * In development this is `<project>/assets/`.
 * In a packaged Electron app the files are under `process.resourcesPath`.
 */
function resolveAssetsRoot(): string {
  // When packaged, Electron sets app.isPackaged and places extra resources
  // alongside the asar archive.  In development we fall back to the repo root.
  const devPath = path.join(__dirname, "..", "..", "assets");
  const prodPath = path.join(process.resourcesPath ?? "", "assets");
  return fs.existsSync(devPath) ? devPath : prodPath;
}

// ── Default layout loading ──────────────────────────────────────

/**
 * Load the bundled default layout from `assets/default-layout.json`.
 * Returns the parsed layout object or `null` if not found.
 */
export function loadDefaultLayout(
  assetsRoot?: string,
): OfficeLayout | null {
  const root = assetsRoot ?? resolveAssetsRoot();
  try {
    const layoutPath = path.join(root, "default-layout.json");
    if (!fs.existsSync(layoutPath)) {
      console.log("[AssetLoader] No default-layout.json found at:", layoutPath);
      return null;
    }
    const content = fs.readFileSync(layoutPath, "utf-8");
    const layout = JSON.parse(content) as OfficeLayout;
    console.log(
      `[AssetLoader] Loaded default layout (${layout.cols}x${layout.rows})`,
    );
    return layout;
  } catch (err) {
    console.error(
      `[AssetLoader] Error loading default layout: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

// ── Premium tileset detection ───────────────────────────────────

/**
 * Check whether a `premium/` sub-directory exists inside the assets root,
 * indicating that premium tileset assets have been installed.
 */
export function detectPremiumTileset(assetsRoot?: string): boolean {
  const root = assetsRoot ?? resolveAssetsRoot();
  const premiumDir = path.join(root, "premium");
  return fs.existsSync(premiumDir) && fs.statSync(premiumDir).isDirectory();
}

// ── Send assets to renderer ─────────────────────────────────────

/**
 * Load all bundled assets and push them to the renderer via IPC.
 *
 * Call this once after the BrowserWindow finishes loading the page
 * (`did-finish-load` event) so the renderer is ready to receive.
 */
export function loadAndSendAssets(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  const assetsRoot = resolveAssetsRoot();
  const layout = loadDefaultLayout(assetsRoot);
  const hasPremiumTileset = detectPremiumTileset(assetsRoot);

  const payload = {
    layout,
    hasPremiumTileset,
    assetsRoot,
  };

  win.webContents.send(IpcChannels.ASSETS_LOADED, payload);
  console.log(
    `[AssetLoader] Sent assets to renderer (layout: ${layout ? "yes" : "no"}, premium: ${hasPremiumTileset})`,
  );
}
