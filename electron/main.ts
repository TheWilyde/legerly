import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fsSync from 'node:fs';
import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  WebContents,
  session,
} from 'electron';
import Database from 'better-sqlite3';
import {
  listInvoices,
  createInvoice,
  type NewInvoice,
  deleteInvoice,
  listStock,
  createStock,
  updateStock,
  deleteStock,
  type NewStockItem,
  getInvoice,
  saveInvoice,
  listSaleInvoices,
  createSaleInvoice,
  deleteSaleInvoice,
  getSaleInvoice,
  saveSaleInvoice,
  ledgerSave,
  ledgerGet,
  ledgerList,
  ensureSchema,
} from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, '..');

const APP_ROOT = process.env.APP_ROOT ?? app.getAppPath();
const VITE_PUBLIC = process.env.VITE_PUBLIC ?? path.join(APP_ROOT, 'dist');
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron');
export const PUBLIC_DIR = VITE_PUBLIC;

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const RENDERER_DIST = path.join(process.env.APP_ROOT!, 'dist');

const PRELOAD_PATH = path.join(
  MAIN_DIST,
  VITE_DEV_SERVER_URL ? 'preload.mjs' : 'preload.js'
);

const IS_DEV = !!process.env.VITE_DEV_SERVER_URL;

let __cspInstalled = false;
function installCSP() {
  if (__cspInstalled) return;
  __cspInstalled = true;

  // Dev: allow Vite HMR + React Refresh preamble (inline + eval)
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
    "frame-ancestors 'none'",
  ].join('; ');

  // Prod: strict (no inline/eval, no remote origins)
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
    "frame-ancestors 'none'",
  ].join('; ');

  const csp = IS_DEV ? devPolicy : prodPolicy;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    headers['Content-Security-Policy'] = [csp];
    callback({responseHeaders: headers});
  });

  if (IS_DEV) process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

let win: BrowserWindow | null;

// Workspace state (lazy-open DB per tab)
type WorkspaceConn = {
  id: string;
  name: string;
  path?: string;
  db?: Database.Database; // lazy
  dirty: boolean;
  needsWriteName?: boolean; // write meta.name on first open
};
const workspaceConns = new Map<string, WorkspaceConn>();
const activeWorkspaceByWC = new Map<number, string | undefined>();

function writeWorkspaceName(db: Database.Database, name: string) {
  db.prepare(
    `INSERT OR REPLACE INTO meta (key,value) VALUES ('name', @name)`
  ).run({name});
}

// Read workspace name from DB
function readWorkspaceName(db: Database.Database): string | undefined {
  const row = db.prepare(`SELECT value FROM meta WHERE key='name'`).get() as
    | {value?: string}
    | undefined;
  return row?.value;
}

// Open lazily and ensure schema + sync name
function openDbFor(ws: WorkspaceConn): Database.Database {
  if (ws.db) return ws.db;
  if (!ws.path) throw new Error('Workspace has no file path');
  const d = new Database(ws.path);
  ensureSchema(d);
  if (ws.needsWriteName) {
    writeWorkspaceName(d, ws.name);
    ws.needsWriteName = false;
  } else {
    const stored = readWorkspaceName(d);
    if (stored && stored !== ws.name) {
      ws.name = stored;
      if (win) win.webContents.send('workspace:opened', dtoOf(ws));
    }
  }
  ws.db = d;
  return d;
}

function dtoOf(ws: WorkspaceConn) {
  return {
    id: ws.id,
    name: ws.name,
    path: ws.path,
    dirty: ws.dirty,
    snapshot: {},
  };
}

// Ensure a DB is returned even if renderer hasn't activated yet
function getDbOrDefault(wc: WebContents): Database.Database {
  // Seed defaults if none
  if (workspaceConns.size === 0) bootstrapDefaultWorkspaces({emit: false});
  // Try active
  const activeId = activeWorkspaceByWC.get(wc.id);
  const fromActive = activeId ? workspaceConns.get(activeId) : undefined;
  if (fromActive) return openDbFor(fromActive);
  // Fallback to first
  const first = workspaceConns.values().next().value as
    | WorkspaceConn
    | undefined;
  if (!first) throw new Error('No workspaces available');
  // Remember this for this webContents
  activeWorkspaceByWC.set(wc.id, first.id);
  return openDbFor(first);
}

// Touch (create) the file now; open DB on first use
function openOrCreateWorkspaceAt(
  filePath: string,
  id: string,
  name: string
): WorkspaceConn {
  const existing = workspaceConns.get(id);
  if (existing) return existing;
  fsSync.mkdirSync(path.dirname(filePath), {recursive: true});
  const exists = fsSync.existsSync(filePath);
  if (!exists) {
    // create empty file so it’s visible in Explorer
    const fd = fsSync.openSync(filePath, 'a');
    fsSync.closeSync(fd);
  }
  const ws: WorkspaceConn = {
    id,
    name,
    path: filePath,
    dirty: false,
    needsWriteName: !exists,
  };
  workspaceConns.set(id, ws);
  return ws;
}

// Create/open defaults; optionally emit events
function bootstrapDefaultWorkspaces(options?: {emit?: boolean}) {
  const emit = options?.emit !== false;
  if (workspaceConns.size > 0)
    return Array.from(workspaceConns.values()).map(dtoOf);
  const baseDir = path.join(app.getPath('userData'), 'workspaces');
  fsSync.mkdirSync(baseDir, {recursive: true});
  const defs = [
    {id: 'business', name: 'Bussiness Empire', file: 'business-empire.storedb'},
    {id: 'bartan', name: 'Bartan Markaz', file: 'bartan-markaz.storedb'},
    {id: 'customers', name: 'Customers', file: 'customers.storedb'},
  ] as const;
  const created: ReturnType<typeof dtoOf>[] = [];
  for (const d of defs) {
    const p = path.join(baseDir, d.file);
    const ws = openOrCreateWorkspaceAt(p, d.id, d.name);
    const dto = dtoOf(ws);
    created.push(dto);
    if (emit && win) win.webContents.send('workspace:opened', dto);
  }
  return created;
}

// IPC routing
ipcMain.handle('invoices:list', (e) => listInvoices(getDbOrDefault(e.sender)));
ipcMain.handle('invoices:create', (e, payload: NewInvoice) =>
  createInvoice(payload, getDbOrDefault(e.sender))
);
ipcMain.handle('invoices:delete', (e, id: number) => {
  deleteInvoice(id, getDbOrDefault(e.sender));
  return true;
});
ipcMain.handle('invoices:get', (e, id: number) =>
  getInvoice(id, getDbOrDefault(e.sender))
);
ipcMain.handle('invoices:save', (e, payload) =>
  saveInvoice(payload, getDbOrDefault(e.sender))
);

ipcMain.handle('stock:list', (e) => listStock(getDbOrDefault(e.sender)));
ipcMain.handle('stock:create', (e, payload: NewStockItem) =>
  createStock(payload, getDbOrDefault(e.sender))
);
ipcMain.handle('stock:update', (e, id: number, payload: NewStockItem) =>
  updateStock(id, payload, getDbOrDefault(e.sender))
);
ipcMain.handle('stock:delete', (e, id: number) => {
  deleteStock(id, getDbOrDefault(e.sender));
  return true;
});

ipcMain.handle('sales:list', (e) => listSaleInvoices(getDbOrDefault(e.sender)));
ipcMain.handle('sales:create', (e, payload: NewInvoice) =>
  createSaleInvoice(payload, getDbOrDefault(e.sender))
);
ipcMain.handle('sales:delete', (e, id: number) => {
  deleteSaleInvoice(id, getDbOrDefault(e.sender));
  return true;
});
ipcMain.handle('sales:get', (e, id: number) =>
  getSaleInvoice(id, getDbOrDefault(e.sender))
);
ipcMain.handle('sales:save', (e, payload) =>
  saveSaleInvoice(payload, getDbOrDefault(e.sender))
);

// ADD missing Ledger IPC handlers
ipcMain.handle('ledger:save', (e, payload) =>
  ledgerSave(payload, getDbOrDefault(e.sender))
);
ipcMain.handle('ledger:get', (e, id: number) =>
  ledgerGet(id, getDbOrDefault(e.sender))
);
ipcMain.handle('ledger:list', (e) => ledgerList(getDbOrDefault(e.sender)));

// Workspace rename (persist meta.name and update DTO)
ipcMain.handle('workspace:rename', (_e, id: string, name: string) => {
  const ws = workspaceConns.get(id);
  if (!ws) return {error: 'NOT_FOUND'};
  ws.name = String(name || '').trim() || ws.name;
  try {
    const d = openDbFor(ws);
    writeWorkspaceName(d, ws.name);
  } catch {}
  if (win) win.webContents.send('workspace:opened', dtoOf(ws));
  return true;
});

ipcMain.on('workspace:activate', (e, id?: string) => {
  activeWorkspaceByWC.set(e.sender.id, id || undefined);
});

// List currently open workspaces (ensure defaults exist without emitting)
ipcMain.handle('workspace:list', () => {
  if (workspaceConns.size === 0) bootstrapDefaultWorkspaces({emit: false});
  return Array.from(workspaceConns.values()).map(dtoOf);
});

// Print API (stubs to satisfy renderer; implement real PDF later)
ipcMain.handle(
  'print:save-invoice-pdf',
  async (_e, kind: 'purchase' | 'sale', id: number, pageSize?: 'A4' | 'A5') => {
    // TODO: implement printing to PDF; return file path
    console.log('print:save-invoice-pdf requested', {kind, id, pageSize});
    return null;
  }
);
ipcMain.handle('print:ready', async () => true);

// Create window with secure flags; disable devTools in prod
function createMainWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 820,
    icon: path.join(PUBLIC_DIR, 'electron-vite.svg'),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !!VITE_DEV_SERVER_URL,
    },
    autoHideMenuBar: true,
  });
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({mode: 'right'});
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.webContents.once('did-finish-load', () => {
    try {
      // Emit all seeded workspaces for the renderer UI
      const seeded = Array.from(workspaceConns.values()).map(dtoOf);
      for (const dto of seeded) win!.webContents.send('workspace:opened', dto);

      // Default activate first workspace for this webContents
      const first = workspaceConns.values().next().value as
        | WorkspaceConn
        | undefined;
      if (first) {
        activeWorkspaceByWC.set(win!.webContents.id, first.id);
        // Inform renderer (optional)
        win!.webContents.send('workspace:activated', first.id);
      }
    } catch (e: any) {
      win?.webContents.send('workspace:error', {
        id: undefined,
        code: 'BOOTSTRAP_FAILED',
        message: String(e?.message || e),
      });
    }
  });

  win.on('closed', () => (win = null));
}

app.whenReady().then(() => {
  // Ensure CSP is actually applied
  installCSP();

  // Seed workspaces BEFORE creating the window so workspace:list has data immediately
  try {
    bootstrapDefaultWorkspaces({emit: false});
  } catch {}
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (workspaceConns.size === 0) bootstrapDefaultWorkspaces({emit: false});
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Close DBs on quit
app.on('before-quit', () => {
  for (const ws of workspaceConns.values()) {
    try {
      ws.db?.close();
    } catch {}
  }
});
