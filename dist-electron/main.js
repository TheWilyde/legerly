import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
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
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      purchaseRate REAL NOT NULL,
      purchaseQty REAL NOT NULL,
      saleRate REAL NOT NULL,
      saleQty REAL NOT NULL,
      createdAt TEXT NOT NULL
    )
  `
  ).run();
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      qty REAL NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `
  ).run();
}
function listInvoices() {
  return db.prepare(
    `SELECT id, number, supplierName, total, createdAt FROM invoices ORDER BY id DESC`
  ).all();
}
function createInvoice(input) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `PI-${randomUUID()}`;
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
function listStock() {
  return db.prepare(
    `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt FROM stock ORDER BY id ASC`
  ).all();
}
function createStock(input) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const info = db.prepare(
    `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
       VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, @createdAt)`
  ).run({ ...input, createdAt });
  return { id: Number(info.lastInsertRowid), createdAt, ...input };
}
function updateStock(id, input) {
  db.prepare(
    `UPDATE stock SET code=@code, name=@name, purchaseRate=@purchaseRate, purchaseQty=@purchaseQty, saleRate=@saleRate, saleQty=@saleQty WHERE id=@id`
  ).run({ id, ...input });
  const row = db.prepare(
    `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt FROM stock WHERE id = ?`
  ).get(id);
  if (!row) throw new Error("Stock item not found after update");
  return row;
}
function deleteStock(id) {
  db.prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}
function getInvoice(id) {
  const inv = db.prepare(
    `SELECT id, number, supplierName, total, createdAt FROM invoices WHERE id = ?`
  ).get(id);
  if (!inv) return void 0;
  const items = db.prepare(
    `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
  ).all(id);
  return { invoice: inv, items };
}
function saveInvoice(payload) {
  const tx = db.transaction(
    (p) => {
      let invoiceId = p.id ?? 0;
      const createdAt = (/* @__PURE__ */ new Date()).toISOString();
      if (!p.id) {
        const uid = `PI-${randomUUID()}`;
        const info = db.prepare(
          `INSERT INTO invoices (uid, number, supplierName, total, createdAt)
             VALUES (@uid, @number, @supplierName, @total, @createdAt)`
        ).run({
          uid,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total,
          createdAt
        });
        invoiceId = Number(info.lastInsertRowid);
      } else {
        db.prepare(
          `UPDATE invoices SET number=@number, supplierName=@supplierName, total=@total WHERE id=@id`
        ).run({
          id: p.id,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total
        });
        db.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);
      }
      const insertItem = db.prepare(
        `INSERT INTO invoice_items (invoiceId, code, name, rate, qty, position)
         VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
      );
      for (const it of p.items) {
        insertItem.run({
          invoiceId,
          code: it.code,
          name: it.name,
          rate: it.rate,
          qty: it.qty,
          position: it.position
        });
      }
      const invoice = db.prepare(
        `SELECT id, number, supplierName, total, createdAt FROM invoices WHERE id = ?`
      ).get(invoiceId);
      const items = db.prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
      ).all(invoiceId);
      return { invoice, items };
    }
  );
  return tx(payload);
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
  ipcMain.handle("invoices:get", (_e, id) => getInvoice(id));
  ipcMain.handle(
    "invoices:save",
    (_e, payload) => saveInvoice(payload)
  );
  ipcMain.handle("stock:list", () => listStock());
  ipcMain.handle(
    "stock:create",
    (_e, payload) => createStock(payload)
  );
  ipcMain.handle(
    "stock:update",
    (_e, id, payload) => updateStock(id, payload)
  );
  ipcMain.handle("stock:delete", (_e, id) => {
    deleteStock(id);
    return true;
  });
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
