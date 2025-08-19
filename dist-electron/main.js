import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
let db;
function initDatabase(dataDir) {
  const dbPath = path.join(dataDir, "app.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT UNIQUE,
      number TEXT NOT NULL,
      supplierName TEXT NOT NULL,
      total REAL NOT NULL,
      createdAt TEXT NOT NULL
    )
  `
  ).run();
  const cols = db.prepare(`PRAGMA table_info(invoices)`).all();
  if (!cols.find((c) => c.name === "uid")) {
    db.prepare(`ALTER TABLE invoices ADD COLUMN uid TEXT`).run();
  }
  db.prepare(
    `UPDATE invoices SET uid = 'PI-' || CAST(strftime('%s','now') AS TEXT) || '-' || id WHERE uid IS NULL`
  ).run();
}
function listInvoices() {
  return db.prepare(
    `SELECT id, number, supplierName, total, createdAt FROM invoices ORDER BY id DESC`
  ).all();
}
function createInvoice(input) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `PI-${Date.now()}`;
  const stmt = db.prepare(
    `INSERT INTO invoices (uid, number, supplierName, total, createdAt)
     VALUES (@uid, @number, @supplierName, @total, @createdAt)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt
  };
}
function deleteInvoice(id) {
  db.prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 750,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs")
    },
    autoHideMenuBar: true
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.webContents.openDevTools();
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  initDatabase(app.getPath("userData"));
  ipcMain.handle("invoices:list", () => listInvoices());
  ipcMain.handle(
    "invoices:create",
    (_e, payload) => createInvoice(payload)
  );
  ipcMain.handle("invoices:delete", (_e, id) => {
    deleteInvoice(id);
    return true;
  });
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
