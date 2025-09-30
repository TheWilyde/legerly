import { fileURLToPath } from "node:url";
import path from "node:path";
import fsSync from "node:fs";
import { app, ipcMain, BrowserWindow, session, Menu } from "electron";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
let db;
function _db(override) {
  return override ?? db;
}
function listInvoices(dbOverride) {
  return _db(dbOverride).prepare(
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
function createInvoice(input, dbOverride) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `PI-${randomUUID()}`;
  const stmt = _db(dbOverride).prepare(
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
function deleteInvoice(id, dbOverride) {
  _db(dbOverride).prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}
function listStock(dbOverride) {
  return _db(dbOverride).prepare(
    `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt FROM stock ORDER BY id ASC`
  ).all();
}
function createStock(input, dbOverride) {
  const d = _db(dbOverride);
  const code = String(input.code ?? "").trim().toUpperCase();
  const name = String(input.name ?? "").trim();
  try {
    const stmt = d.prepare(`
      INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
      VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))
    `);
    const info = stmt.run({
      code,
      name,
      purchaseRate: +input.purchaseRate || 0,
      purchaseQty: +input.purchaseQty || 0,
      saleRate: +input.saleRate || 0,
      saleQty: +input.saleQty || 0
    });
    return d.prepare(`SELECT * FROM stock WHERE id=@id`).get({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("stock.code")) {
      throw new Error("ERR_STOCK_CODE_EXISTS");
    }
    throw e;
  }
}
function updateStock(id, input, dbOverride) {
  const d = _db(dbOverride);
  const code = String(input.code ?? "").trim().toUpperCase();
  const name = String(input.name ?? "").trim();
  try {
    d.prepare(
      `
      UPDATE stock
      SET code=@code, name=@name,
          purchaseRate=@purchaseRate, purchaseQty=@purchaseQty,
          saleRate=@saleRate, saleQty=@saleQty
      WHERE id=@id
    `
    ).run({
      id,
      code,
      name,
      purchaseRate: +input.purchaseRate || 0,
      purchaseQty: +input.purchaseQty || 0,
      saleRate: +input.saleRate || 0,
      saleQty: +input.saleQty || 0
    });
    return d.prepare(`SELECT * FROM stock WHERE id=@id`).get({ id });
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("stock.code")) {
      throw new Error("ERR_STOCK_CODE_EXISTS");
    }
    throw e;
  }
}
function deleteStock(id, dbOverride) {
  _db(dbOverride).prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}
function getInvoice(id, dbOverride) {
  const d = _db(dbOverride);
  const inv = d.prepare(
    `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
  ).get(id);
  if (!inv) return void 0;
  const items = d.prepare(
    `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
  ).all(id);
  return { invoice: inv, items };
}
function saveInvoice(payload, dbOverride) {
  const d = _db(dbOverride);
  const items = (payload.items ?? []).map((it) => ({
    code: String(it.code ?? "").trim().toUpperCase(),
    name: String(it.name ?? "").trim(),
    rate: +it.rate || 0,
    qty: +it.qty || 0,
    position: +it.position || 0
  }));
  const tx = d.transaction((p) => {
    let invoiceId = p.id ?? 0;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    if (!p.id) {
      const uid = `PI-${randomUUID()}`;
      const info = d.prepare(
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
      d.prepare(
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
      d.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);
    }
    const insertItem = d.prepare(
      `INSERT INTO invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: it.rate,
        qty: it.qty,
        position: it.position
      });
    }
    const invoice = d.prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
    ).get(invoiceId);
    const itemsOut = d.prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    ).all(invoiceId);
    return { invoice, items: itemsOut };
  });
  return tx(payload);
}
function listSaleInvoices(dbOverride) {
  return _db(dbOverride).prepare(
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
function createSaleInvoice(input, dbOverride) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `SI-${randomUUID()}`;
  const stmt = _db(dbOverride).prepare(
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
function deleteSaleInvoice(id, dbOverride) {
  _db(dbOverride).prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}
function getSaleInvoice(id, dbOverride) {
  const d = _db(dbOverride);
  const inv = d.prepare(
    `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
  ).get(id);
  if (!inv) return void 0;
  const items = d.prepare(
    `SELECT id, invoiceId, code, name, rate, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
  ).all(id);
  return { invoice: inv, items };
}
function saveSaleInvoice(payload, dbOverride) {
  const d = _db(dbOverride);
  const tx = d.transaction((p) => {
    let invoiceId = p.id ?? 0;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    if (!p.id) {
      const uid = `SI-${randomUUID()}`;
      const info = d.prepare(
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
      d.prepare(
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
      d.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(p.id);
    }
    const insertItem = d.prepare(
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
    const invoice = d.prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
    ).get(invoiceId);
    const items = d.prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    ).all(invoiceId);
    return { invoice, items };
  });
  return tx(payload);
}
function ledgerSave(payload, dbOverride) {
  const d = _db(dbOverride);
  const { id, customerName, contactNo, totals, rows } = payload;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (!customerName.trim()) return { error: "CUSTOMER_REQUIRED" };
  const tx = d.transaction(() => {
    let ledgerId = id;
    if (!ledgerId) {
      const info = d.prepare(
        `INSERT INTO ledgers (customerName, contactNo, totalDebit, totalCredit, netBalance, createdAt, updatedAt)
           VALUES (@customerName, @contactNo, @totalDebit, @totalCredit, @netBalance, @createdAt, @updatedAt)`
      ).run({
        customerName: customerName.trim(),
        contactNo: contactNo?.trim() || "",
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        netBalance: totals.net,
        createdAt: now,
        updatedAt: now
      });
      ledgerId = Number(info.lastInsertRowid);
    } else {
      d.prepare(
        `UPDATE ledgers
         SET customerName=@customerName,
             contactNo=@contactNo,
             totalDebit=@totalDebit,
             totalCredit=@totalCredit,
             netBalance=@netBalance,
             updatedAt=@updatedAt
         WHERE id=@id`
      ).run({
        id: ledgerId,
        customerName: customerName.trim(),
        contactNo: contactNo?.trim() || "",
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        netBalance: totals.net,
        updatedAt: now
      });
      d.prepare(`DELETE FROM ledger_rows WHERE ledgerId=?`).run(ledgerId);
    }
    const insertRow = d.prepare(`
      INSERT INTO ledger_rows (ledgerId, position, date, particulars, debit, credit, crDr)
      VALUES (@ledgerId, @position, @date, @particulars, @debit, @credit, @crDr)
    `);
    for (const r of rows) {
      insertRow.run({
        ledgerId,
        position: r.position,
        date: r.date || null,
        particulars: r.particulars || "",
        debit: r.debit || 0,
        credit: r.credit || 0,
        crDr: r.crDr
      });
    }
    return { id: ledgerId };
  });
  return tx();
}
function ledgerGet(ledgerId, dbOverride) {
  const d = _db(dbOverride);
  const ledger = d.prepare(
    `SELECT id, customerName, contactNo, totalDebit, totalCredit, netBalance
       FROM ledgers WHERE id=?`
  ).get(ledgerId);
  if (!ledger) return void 0;
  const rows = d.prepare(
    `SELECT id, date, particulars, debit, credit, crDr, position
       FROM ledger_rows WHERE ledgerId=? ORDER BY position ASC`
  ).all(ledgerId);
  return {
    id: ledger.id,
    customerName: ledger.customerName,
    contactNo: ledger.contactNo,
    totals: {
      debit: ledger.totalDebit,
      credit: ledger.totalCredit,
      net: ledger.netBalance
    },
    rows
  };
}
function ledgerList(dbOverride) {
  const list = _db(dbOverride).prepare(
    `SELECT id, customerName, totalDebit, totalCredit, netBalance
       FROM ledgers ORDER BY id DESC`
  ).all();
  return list.map((l) => ({
    id: l.id,
    customerName: l.customerName,
    totals: {
      debit: l.totalDebit,
      credit: l.totalCredit,
      net: l.netBalance
    }
  }));
}
function ensureSchema(db2) {
  db2.pragma("journal_mode = WAL");
  db2.pragma("foreign_keys = ON");
  db2.prepare(
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`
  ).run();
  const getVer = db2.prepare(
    `SELECT value FROM meta WHERE key='schema_version'`
  );
  const setVer = db2.prepare(
    `INSERT OR REPLACE INTO meta (key,value) VALUES ('schema_version', @v)`
  );
  const cur = getVer.get();
  const v = Number(cur?.value ?? 0);
  const createBaseSchema = () => {
    db2.prepare(
      `
      CREATE TABLE IF NOT EXISTS invoices (
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
    db2.prepare(
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
    db2.prepare(
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
    db2.prepare(
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
    db2.prepare(
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
    db2.prepare(
      `
      CREATE TABLE IF NOT EXISTS ledgers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customerName TEXT NOT NULL,
        contactNo TEXT,
        totalDebit REAL DEFAULT 0,
        totalCredit REAL DEFAULT 0,
        netBalance REAL DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `
    ).run();
    db2.prepare(
      `
      CREATE TABLE IF NOT EXISTS ledger_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ledgerId INTEGER NOT NULL,
        position INTEGER NOT NULL,
        date TEXT,
        particulars TEXT,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        crDr TEXT,
        FOREIGN KEY(ledgerId) REFERENCES ledgers(id) ON DELETE CASCADE
      )
    `
    ).run();
    db2.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId)`
    ).run();
    db2.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoiceId ON sale_invoice_items(invoiceId)`
    ).run();
    db2.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_code ON stock(code)`
    ).run();
    db2.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ledger_rows_ledgerId ON ledger_rows(ledgerId)`
    ).run();
  };
  const hardenSchema = () => {
    const ensureCols = (table, defs) => {
      const cols = db2.prepare(`PRAGMA table_info(${table})`).all();
      for (const d of defs) {
        if (!cols.find((c) => c.name === d.name)) {
          db2.prepare(`ALTER TABLE ${table} ADD COLUMN ${d.ddl}`).run();
        }
      }
    };
    ensureCols("invoices", [
      { name: "uid", ddl: "uid TEXT" },
      { name: "number", ddl: "number TEXT DEFAULT ''" },
      { name: "supplierName", ddl: "supplierName TEXT DEFAULT ''" },
      { name: "total", ddl: "total REAL DEFAULT 0" },
      { name: "createdAt", ddl: "createdAt TEXT DEFAULT CURRENT_TIMESTAMP" },
      { name: "address", ddl: "address TEXT DEFAULT ''" },
      { name: "invoiceDate", ddl: "invoiceDate TEXT" }
    ]);
    ensureCols("invoice_items", [
      { name: "code", ddl: "code TEXT" },
      { name: "name", ddl: "name TEXT" },
      { name: "rate", ddl: "rate REAL DEFAULT 0" },
      { name: "qty", ddl: "qty REAL DEFAULT 0" },
      { name: "position", ddl: "position INTEGER DEFAULT 0" }
    ]);
    ensureCols("stock", [
      { name: "code", ddl: "code TEXT" },
      { name: "name", ddl: "name TEXT" },
      { name: "purchaseRate", ddl: "purchaseRate REAL DEFAULT 0" },
      { name: "purchaseQty", ddl: "purchaseQty REAL DEFAULT 0" },
      { name: "saleRate", ddl: "saleRate REAL DEFAULT 0" },
      { name: "saleQty", ddl: "saleQty REAL DEFAULT 0" },
      { name: "createdAt", ddl: "createdAt TEXT DEFAULT CURRENT_TIMESTAMP" }
    ]);
    ensureCols("sale_invoices", [
      { name: "uid", ddl: "uid TEXT" },
      { name: "number", ddl: "number TEXT DEFAULT ''" },
      { name: "supplierName", ddl: "supplierName TEXT DEFAULT ''" },
      { name: "total", ddl: "total REAL DEFAULT 0" },
      { name: "createdAt", ddl: "createdAt TEXT DEFAULT CURRENT_TIMESTAMP" },
      { name: "address", ddl: "address TEXT DEFAULT ''" },
      { name: "invoiceDate", ddl: "invoiceDate TEXT" }
    ]);
    ensureCols("sale_invoice_items", [
      { name: "code", ddl: "code TEXT" },
      { name: "name", ddl: "name TEXT" },
      { name: "rate", ddl: "rate REAL DEFAULT 0" },
      { name: "qty", ddl: "qty REAL DEFAULT 0" },
      { name: "position", ddl: "position INTEGER DEFAULT 0" }
    ]);
    db2.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId)`
    ).run();
    db2.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoiceId ON sale_invoice_items(invoiceId)`
    ).run();
    db2.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_code ON stock(code)`
    ).run();
    db2.prepare(
      `CREATE INDEX IF NOT EXISTS idx_ledger_rows_ledgerId ON ledger_rows(ledgerId)`
    ).run();
  };
  db2.prepare("BEGIN").run();
  try {
    if (v === 0) createBaseSchema();
    hardenSchema();
    if (v === 0) setVer.run({ v: "1" });
    db2.prepare("COMMIT").run();
  } catch (e) {
    db2.prepare("ROLLBACK").run();
    throw e;
  }
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
const IS_DEV = !!process.env.VITE_DEV_SERVER_URL;
let __cspInstalled = false;
function installCSP() {
  if (__cspInstalled) return;
  __cspInstalled = true;
  const devPolicy = [
    "default-src 'self' http://localhost:5173",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self' http://localhost:5173 'unsafe-eval' 'unsafe-inline' blob:",
    "style-src 'self' http://localhost:5173 'unsafe-inline'",
    "img-src 'self' data: blob: file: http://localhost:5173",
    "font-src 'self' data: http://localhost:5173",
    "connect-src 'self' http://localhost:5173 ws://localhost:5173",
    "media-src 'self' blob: data:",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
  const prodPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob: data:",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
  const csp = IS_DEV ? devPolicy : prodPolicy;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    headers["Content-Security-Policy"] = [csp];
    callback({ responseHeaders: headers });
  });
  if (IS_DEV) process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
}
let win;
const workspaceConns = /* @__PURE__ */ new Map();
const activeWorkspaceByWC = /* @__PURE__ */ new Map();
function writeWorkspaceName(db2, name) {
  db2.prepare(
    `INSERT OR REPLACE INTO meta (key,value) VALUES ('name', @name)`
  ).run({ name });
}
function readWorkspaceName(db2) {
  const row = db2.prepare(`SELECT value FROM meta WHERE key='name'`).get();
  return row?.value;
}
function openDbFor(ws) {
  if (ws.db) return ws.db;
  if (!ws.path) throw new Error("Workspace has no file path");
  const d = new Database(ws.path);
  ensureSchema(d);
  if (ws.needsWriteName) {
    writeWorkspaceName(d, ws.name);
    ws.needsWriteName = false;
  } else {
    const stored = readWorkspaceName(d);
    if (stored && stored !== ws.name) {
      ws.name = stored;
      if (win) win.webContents.send("workspace:opened", dtoOf(ws));
    }
  }
  ws.db = d;
  return d;
}
function dtoOf(ws) {
  return {
    id: ws.id,
    name: ws.name,
    path: ws.path,
    dirty: ws.dirty,
    snapshot: {}
  };
}
function getDbOrDefault(wc) {
  if (workspaceConns.size === 0) bootstrapDefaultWorkspaces({ emit: false });
  const activeId = activeWorkspaceByWC.get(wc.id);
  const fromActive = activeId ? workspaceConns.get(activeId) : void 0;
  if (fromActive) return openDbFor(fromActive);
  const first = workspaceConns.values().next().value;
  if (!first) throw new Error("No workspaces available");
  activeWorkspaceByWC.set(wc.id, first.id);
  return openDbFor(first);
}
function openOrCreateWorkspaceAt(filePath, id, name) {
  const existing = workspaceConns.get(id);
  if (existing) return existing;
  fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
  const exists = fsSync.existsSync(filePath);
  if (!exists) {
    const fd = fsSync.openSync(filePath, "a");
    fsSync.closeSync(fd);
  }
  const ws = {
    id,
    name,
    path: filePath,
    dirty: false,
    needsWriteName: !exists
  };
  workspaceConns.set(id, ws);
  return ws;
}
function bootstrapDefaultWorkspaces(options) {
  const emit = options?.emit !== false;
  if (workspaceConns.size > 0)
    return Array.from(workspaceConns.values()).map(dtoOf);
  const baseDir = path.join(app.getPath("userData"), "workspaces");
  fsSync.mkdirSync(baseDir, { recursive: true });
  const defs = [
    { id: "business", name: "Bussiness Empire", file: "business-empire.storedb" },
    { id: "bartan", name: "Bartan Markaz", file: "bartan-markaz.storedb" },
    { id: "customers", name: "Customers", file: "customers.storedb" }
  ];
  const created = [];
  for (const d of defs) {
    const p = path.join(baseDir, d.file);
    const ws = openOrCreateWorkspaceAt(p, d.id, d.name);
    const dto = dtoOf(ws);
    created.push(dto);
    if (emit && win) win.webContents.send("workspace:opened", dto);
  }
  return created;
}
ipcMain.handle("invoices:list", (e) => listInvoices(getDbOrDefault(e.sender)));
ipcMain.handle(
  "invoices:create",
  (e, payload) => createInvoice(payload, getDbOrDefault(e.sender))
);
ipcMain.handle("invoices:delete", (e, id) => {
  deleteInvoice(id, getDbOrDefault(e.sender));
  return true;
});
ipcMain.handle(
  "invoices:get",
  (e, id) => getInvoice(id, getDbOrDefault(e.sender))
);
ipcMain.handle(
  "invoices:save",
  (e, payload) => saveInvoice(payload, getDbOrDefault(e.sender))
);
ipcMain.handle("stock:list", (e) => listStock(getDbOrDefault(e.sender)));
ipcMain.handle(
  "stock:create",
  (e, payload) => createStock(payload, getDbOrDefault(e.sender))
);
ipcMain.handle(
  "stock:update",
  (e, id, payload) => updateStock(id, payload, getDbOrDefault(e.sender))
);
ipcMain.handle("stock:delete", (e, id) => {
  deleteStock(id, getDbOrDefault(e.sender));
  return true;
});
ipcMain.handle("sales:list", (e) => listSaleInvoices(getDbOrDefault(e.sender)));
ipcMain.handle(
  "sales:create",
  (e, payload) => createSaleInvoice(payload, getDbOrDefault(e.sender))
);
ipcMain.handle("sales:delete", (e, id) => {
  deleteSaleInvoice(id, getDbOrDefault(e.sender));
  return true;
});
ipcMain.handle(
  "sales:get",
  (e, id) => getSaleInvoice(id, getDbOrDefault(e.sender))
);
ipcMain.handle(
  "sales:save",
  (e, payload) => saveSaleInvoice(payload, getDbOrDefault(e.sender))
);
ipcMain.handle(
  "ledger:save",
  (e, payload) => ledgerSave(payload, getDbOrDefault(e.sender))
);
ipcMain.handle(
  "ledger:get",
  (e, id) => ledgerGet(id, getDbOrDefault(e.sender))
);
ipcMain.handle("ledger:list", (e) => ledgerList(getDbOrDefault(e.sender)));
ipcMain.handle("workspace:rename", (_e, id, name) => {
  const ws = workspaceConns.get(id);
  if (!ws) return { error: "NOT_FOUND" };
  ws.name = String(name || "").trim() || ws.name;
  try {
    const d = openDbFor(ws);
    writeWorkspaceName(d, ws.name);
  } catch {
  }
  if (win) win.webContents.send("workspace:opened", dtoOf(ws));
  return true;
});
ipcMain.on("workspace:activate", (e, id) => {
  activeWorkspaceByWC.set(e.sender.id, id || void 0);
});
ipcMain.handle("workspace:list", () => {
  if (workspaceConns.size === 0) bootstrapDefaultWorkspaces({ emit: false });
  return Array.from(workspaceConns.values()).map(dtoOf);
});
ipcMain.handle(
  "print:save-invoice-pdf",
  async (_e, kind, id, pageSize) => {
    console.log("print:save-invoice-pdf requested", { kind, id, pageSize });
    return null;
  }
);
ipcMain.handle("print:ready", async () => true);
function createMainWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 820,
    icon: path.join(PUBLIC_DIR, "electron-vite.svg"),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !!VITE_DEV_SERVER_URL
    },
    autoHideMenuBar: true
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "right" });
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  win.webContents.once("did-finish-load", () => {
    try {
      const seeded = Array.from(workspaceConns.values()).map(dtoOf);
      for (const dto of seeded) win.webContents.send("workspace:opened", dto);
      const first = workspaceConns.values().next().value;
      if (first) {
        activeWorkspaceByWC.set(win.webContents.id, first.id);
        win.webContents.send("workspace:activated", first.id);
      }
    } catch (e) {
      win?.webContents.send("workspace:error", {
        id: void 0,
        code: "BOOTSTRAP_FAILED",
        message: String(e?.message || e)
      });
    }
  });
  win.on("closed", () => win = null);
}
app.whenReady().then(() => {
  installCSP();
  try {
    bootstrapDefaultWorkspaces({ emit: false });
  } catch {
  }
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (workspaceConns.size === 0) bootstrapDefaultWorkspaces({ emit: false });
      createMainWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  for (const ws of workspaceConns.values()) {
    try {
      ws.db?.close();
    } catch {
    }
  }
});
export {
  MAIN_DIST,
  PUBLIC_DIR,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
