import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import fs$1 from "node:fs/promises";
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
  if (!cols.find((c) => c.name === "address")) {
    db.prepare(`ALTER TABLE invoices ADD COLUMN address TEXT DEFAULT ''`).run();
  }
  if (!cols.find((c) => c.name === "invoiceDate")) {
    db.prepare(`ALTER TABLE invoices ADD COLUMN invoiceDate TEXT`).run();
  }
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
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS sale_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT UNIQUE,
      number TEXT NOT NULL,
      supplierName TEXT NOT NULL,
      total REAL NOT NULL,
      createdAt TEXT NOT NULL,
      address TEXT DEFAULT '',
      invoiceDate TEXT
    )
  `
  ).run();
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS sale_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      qty REAL NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(invoiceId) REFERENCES sale_invoices(id) ON DELETE CASCADE
    )
  `
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId)`
  ).run();
  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoiceId ON sale_invoice_items(invoiceId)`
  ).run();
  db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_code ON stock(code)`
  ).run();
}
function listInvoices() {
  return db.prepare(
    `
      SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC
    `
  ).all();
}
function createInvoice(input) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `PI-${randomUUID()}`;
  const stmt = db.prepare(
    `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? "",
    invoiceDate: input.invoiceDate ?? null
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? "",
    invoiceDate: input.invoiceDate ?? null
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
          `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
             VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
        ).run({
          uid,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total,
          createdAt,
          address: p.address ?? "",
          invoiceDate: p.invoiceDate ?? null
        });
        invoiceId = Number(info.lastInsertRowid);
      } else {
        db.prepare(
          `UPDATE invoices
             SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
           WHERE id=@id`
        ).run({
          id: p.id,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total,
          address: p.address ?? "",
          invoiceDate: p.invoiceDate ?? null
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
        `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
      ).get(invoiceId);
      const items = db.prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
      ).all(invoiceId);
      return { invoice, items };
    }
  );
  return tx(payload);
}
function listSaleInvoices() {
  return db.prepare(
    `
      SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM sale_invoices i
      LEFT JOIN sale_invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC
    `
  ).all();
}
function createSaleInvoice(input) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `SI-${randomUUID()}`;
  const stmt = db.prepare(
    `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? "",
    invoiceDate: input.invoiceDate ?? null
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? "",
    invoiceDate: input.invoiceDate ?? null
  };
}
function deleteSaleInvoice(id) {
  db.prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}
function getSaleInvoice(id) {
  const inv = db.prepare(
    `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
  ).get(id);
  if (!inv) return void 0;
  const items = db.prepare(
    `SELECT id, invoiceId, code, name, rate, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
  ).all(id);
  return { invoice: inv, items };
}
function saveSaleInvoice(payload) {
  const tx = db.transaction(
    (p) => {
      let invoiceId = p.id ?? 0;
      const createdAt = (/* @__PURE__ */ new Date()).toISOString();
      if (!p.id) {
        const uid = `SI-${randomUUID()}`;
        const info = db.prepare(
          `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
             VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
        ).run({
          uid,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total,
          createdAt,
          address: p.address ?? "",
          invoiceDate: p.invoiceDate ?? null
        });
        invoiceId = Number(info.lastInsertRowid);
      } else {
        db.prepare(
          `UPDATE sale_invoices
             SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
           WHERE id=@id`
        ).run({
          id: p.id,
          number: p.number,
          supplierName: p.supplierName,
          total: p.total,
          address: p.address ?? "",
          invoiceDate: p.invoiceDate ?? null
        });
        db.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(
          p.id
        );
      }
      const insertItem = db.prepare(
        `INSERT INTO sale_invoice_items (invoiceId, code, name, rate, qty, position)
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
        `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
      ).get(invoiceId);
      const items = db.prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
      ).all(invoiceId);
      return { invoice, items };
    }
  );
  return tx(payload);
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const APP_ROOT = process.env.APP_ROOT ?? app.getAppPath();
const VITE_PUBLIC = process.env.VITE_PUBLIC ?? path.join(APP_ROOT, "dist");
const MAIN_DIST = path.join(APP_ROOT, "dist-electron");
const PUBLIC_DIR = VITE_PUBLIC;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
const PRELOAD_PATH = path.join(
  MAIN_DIST,
  VITE_DEV_SERVER_URL ? "preload.mjs" : "preload.js"
);
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 750,
    icon: path.join(VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: PRELOAD_PATH
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
  ipcMain.handle("sales:list", () => listSaleInvoices());
  ipcMain.handle(
    "sales:create",
    (_e, payload) => createSaleInvoice(payload)
  );
  ipcMain.handle("sales:delete", (_e, id) => {
    deleteSaleInvoice(id);
    return true;
  });
  ipcMain.handle("sales:get", (_e, id) => getSaleInvoice(id));
  ipcMain.handle(
    "sales:save",
    (_e, payload) => saveSaleInvoice(payload)
  );
  ipcMain.handle(
    "print:save-invoice-pdf",
    async (_evt, args) => {
      const { kind, id, pageSize = "A5" } = args;
      const pdfWin = new BrowserWindow({
        show: false,
        width: 900,
        height: 1270,
        webPreferences: { preload: PRELOAD_PATH }
      });
      const qs = `?size=${pageSize}`;
      const url = VITE_DEV_SERVER_URL ? `${VITE_DEV_SERVER_URL}#/print/${kind}/${id}${qs}` : `file://${path.join(
        RENDERER_DIST,
        "index.html"
      )}#/print/${kind}/${id}${qs}`;
      await pdfWin.loadURL(url);
      await new Promise((resolve) => {
        const done = () => {
          pdfWin.webContents.removeAllListeners("ipc-message");
          resolve();
        };
        const to = setTimeout(done, 2e3);
        pdfWin.webContents.on("ipc-message", (_e, channel) => {
          if (channel === "print:ready") {
            clearTimeout(to);
            done();
          }
        });
      });
      const pdf = await pdfWin.webContents.printToPDF({
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        pageSize,
        printBackground: true,
        landscape: false
      });
      const { filePath, canceled } = await dialog.showSaveDialog(pdfWin, {
        title: `Save ${kind} invoice #${id} as PDF`,
        defaultPath: `invoice-${kind}-${id}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
      if (!filePath || canceled) {
        pdfWin.destroy();
        return null;
      }
      await fs$1.writeFile(filePath, pdf);
      pdfWin.destroy();
      return filePath;
    }
  );
  ipcMain.handle(
    "file:save-buffer",
    async (_evt, args) => {
      const { data, defaultPath } = args;
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: "Save PDF",
        defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
      if (!filePath || canceled) return null;
      await fs$1.writeFile(filePath, Buffer.from(data));
      return filePath;
    }
  );
  createWindow();
});
export {
  MAIN_DIST,
  PUBLIC_DIR,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
