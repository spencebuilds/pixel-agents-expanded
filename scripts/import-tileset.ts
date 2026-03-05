#!/usr/bin/env node
/**
 * import-tileset.ts — Import premium Donarg Office Interior Tileset.
 *
 * After purchasing the tileset from itch.io, run this script to copy the
 * PNG files into the project's assets/premium/ directory.
 *
 * Usage:
 *   npm run import-tileset -- /path/to/downloaded/tileset-directory
 *
 * Or after compilation:
 *   node dist/scripts/import-tileset.js /path/to/downloaded/tileset-directory
 */

import * as fs from "fs";
import * as path from "path";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Destination directory for premium assets.
 * Resolved relative to the project root (two levels up from dist/scripts/).
 */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PREMIUM_DIR = path.join(PROJECT_ROOT, "assets", "premium");

// ─── Helpers ────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(
    "Usage: npm run import-tileset -- <path-to-tileset-directory>\n\n" +
      "Copies all .png files from the given directory into assets/premium/.\n\n" +
      "Steps:\n" +
      "  1. Purchase the Office Interior Tileset by Donarg from itch.io\n" +
      "  2. Download and extract the zip file\n" +
      "  3. Run this script with the path to the extracted directory\n",
  );
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

/**
 * Recursively collect all .png files from a directory tree.
 */
function collectPngFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectPngFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".png")
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const sourcePath = path.resolve(args[0]);

  // Validate source path exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source path does not exist: ${sourcePath}`);
    process.exit(1);
  }

  // Validate source is a directory
  const stat = fs.statSync(sourcePath);
  if (!stat.isDirectory()) {
    console.error(
      `Error: Source path is not a directory: ${sourcePath}\n` +
        "Please provide the path to the extracted tileset directory.",
    );
    process.exit(1);
  }

  // Collect all PNG files from the source directory
  const pngFiles = collectPngFiles(sourcePath);

  if (pngFiles.length === 0) {
    console.error(
      `Error: No .png files found in ${sourcePath}\n` +
        "Make sure you've extracted the tileset zip and are pointing to the correct directory.",
    );
    process.exit(1);
  }

  // Create destination directory
  ensureDirectory(PREMIUM_DIR);

  // Copy files
  let copiedCount = 0;
  let skippedCount = 0;

  for (const srcFile of pngFiles) {
    const fileName = path.basename(srcFile);
    const destFile = path.join(PREMIUM_DIR, fileName);

    // Warn about duplicate filenames (from nested directories)
    if (fs.existsSync(destFile)) {
      const existingStat = fs.statSync(destFile);
      const srcStat = fs.statSync(srcFile);
      if (existingStat.size === srcStat.size) {
        skippedCount++;
        continue;
      }
      // Different file with same name — warn but overwrite
      console.warn(`  Warning: Overwriting existing file: ${fileName}`);
    }

    fs.copyFileSync(srcFile, destFile);
    copiedCount++;
  }

  // Summary
  console.log("\nPremium tileset import complete!");
  console.log(`  Copied: ${copiedCount} file(s)`);
  if (skippedCount > 0) {
    console.log(`  Skipped (identical): ${skippedCount} file(s)`);
  }
  console.log(`  Destination: ${PREMIUM_DIR}`);
  console.log(
    '\nYou can now select "Premium" assets in the Pixel Agents settings.',
  );
}

main();
