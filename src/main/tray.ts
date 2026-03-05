import { BrowserWindow, Menu, Tray, app, nativeImage } from "electron";
import { IpcChannels } from "../shared/types";

/**
 * Create a 16x16 tray icon as a simple pixel-art monitor using a data URL.
 * This avoids needing to bundle an external icon file.
 */
function createTrayIcon(): Electron.NativeImage {
  // A simple 16x16 PNG: dark square with a bright pixel "screen" area.
  // Generated as a minimal base64-encoded PNG.
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64," +
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA" +
      "ZklEQVQ4y2NkYPj/n4EBFTAyMDCgcxgZGRkYsKlhQleAyw" +
      "usLjAyMjL8R5djYGBgYMSmBl0NuhewMDMz/2dkZGTApgZD" +
      "DTYXsDIzMzMyMjIy4FKDTQ1WFzAxMf1nYGD4j00NAE7fHS" +
      "haxYDNAAAAAElFTkSuQmCC"
  );
  // On macOS, mark as template image so it adapts to menu bar theme.
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }
  return icon.resize({ width: 16, height: 16 });
}

/**
 * Create and configure the system tray with a context menu.
 *
 * @param mainWindow - The primary BrowserWindow instance.
 * @returns The created Tray instance (caller should keep a reference to prevent GC).
 */
export function createTray(mainWindow: BrowserWindow): Tray {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip("Pixel Agents");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: "Hide",
      click: () => {
        mainWindow.hide();
      },
    },
    { type: "separator" },
    {
      label: "Settings...",
      click: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send(IpcChannels.OPEN_SETTINGS);
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Toggle window visibility on tray icon click (non-macOS; macOS uses right-click for context menu).
  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}
