import path from 'node:path';
import fs from 'node:fs/promises';
import {app, WebContents} from 'electron';
import Database from 'better-sqlite3';
import {ensureSchema} from './db';
import type {WorkspaceDef} from './config';
import {AppError, ErrorCodes} from './errors';
import log from './logger';

export type WorkspaceConn = {
  id: string;
  name: string;
  path: string;
  db?: Database.Database;
  needsWriteName?: boolean;
  lastUsedAt: number;
};

export class WorkspaceManager {
  private workspaces = new Map<string, WorkspaceConn>();
  private activeByWC = new Map<number, string | undefined>();
  private idleTimer?: NodeJS.Timeout;

  constructor(private idleMs: number) {}

  async initialize(defs: WorkspaceDef[]) {
    const baseDir = path.join(app.getPath('userData'), 'workspaces');
    await fs.mkdir(baseDir, {recursive: true});
    for (const d of defs) {
      const p = path.join(baseDir, d.file);
      await fs.mkdir(path.dirname(p), {recursive: true});
      try {
        await fs.access(p);
      } catch {
        await fs.writeFile(p, '');
      }
      this.workspaces.set(d.id, {
        id: d.id,
        name: d.name,
        path: p,
        needsWriteName: true,
        lastUsedAt: Date.now(),
      });
    }
    this.startIdleCloser();
  }

  list() {
    return Array.from(this.workspaces.values()).map((w) => ({
      id: w.id,
      name: w.name,
      path: w.path,
      dirty: false,
      snapshot: {},
    }));
  }

  activate(wc: WebContents, id?: string | null) {
    const wcId = wc.id;
    const prev = this.activeByWC.get(wcId);
    if (prev && prev !== id) {
      const ws = this.workspaces.get(prev);
      try {
        ws?.db?.close();
      } catch {}
      if (ws) ws.db = undefined;
    }
    this.activeByWC.set(wcId, id || undefined);
  }

  getDbFor(wc: WebContents): Database.Database {
    const activeId = this.activeByWC.get(wc.id);
    const ws = activeId
      ? this.workspaces.get(activeId)
      : Array.from(this.workspaces.values())[0];
    if (!ws)
      throw new AppError(ErrorCodes.NO_WORKSPACES, 'No workspaces available');
    if (!ws.db) {
      ws.db = new Database(ws.path);
      ensureSchema(ws.db);
      // Write workspace display name once into meta.name for this DB
      if (ws.needsWriteName) {
        try {
          ws.db
            .prepare(
              `INSERT OR REPLACE INTO meta (key, value) VALUES ('name', ?)`
            )
            .run(ws.name);
        } catch {}
        ws.needsWriteName = false;
      }
    }
    ws.lastUsedAt = Date.now();
    return ws.db;
  }

  getById(id: string) {
    const ws = this.workspaces.get(id);
    if (!ws)
      throw new AppError(ErrorCodes.WORKSPACE_NOT_FOUND, 'Workspace not found');
    return ws;
  }

  async backup(id: string, destPath?: string) {
    const ws = this.getById(id);
    const defaultDir = path.join(
      app.getPath('documents'),
      'BartanMarkazBackups'
    );
    await fs.mkdir(defaultDir, {recursive: true});
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const target = destPath ?? path.join(defaultDir, `${ws.id}-${ts}.sqlite`);
    await fs.mkdir(path.dirname(target), {recursive: true});

    try {
      if (ws.db) {
        try {
          ws.db.pragma('wal_checkpoint(PASSIVE)');
        } catch {}
        ws.db.backup(target);
      } else {
        const ro = new Database(ws.path, {readonly: true});
        try {
          try {
            ro.pragma('wal_checkpoint(PASSIVE)');
          } catch {}
          ro.backup(target);
        } finally {
          try {
            ro.close();
          } catch {}
        }
      }
      log.info(`[workspace] Backup created for ${ws.id}: ${target}`);
      return target;
    } catch (e) {
      log.error('[workspace] Backup failed:', e);
      throw e;
    }
  }

  private startIdleCloser() {
    clearInterval(this.idleTimer as any);
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      for (const ws of this.workspaces.values()) {
        if (ws.db && now - ws.lastUsedAt > this.idleMs) {
          try {
            ws.db.pragma('wal_checkpoint(TRUNCATE)');
          } catch {}
          try {
            ws.db.close();
          } catch {}
          ws.db = undefined;
        }
      }
    }, Math.max(30_000, Math.floor(this.idleMs / 2)));
  }

  // NEW: prevent timer leak and close DBs
  cleanup() {
    clearInterval(this.idleTimer as any);
    this.idleTimer = undefined;
    for (const ws of this.workspaces.values()) {
      try {
        if (ws.db) {
          try {
            ws.db.pragma('wal_checkpoint(TRUNCATE)');
          } catch {}
          ws.db.close();
        }
      } catch {}
      ws.db = undefined;
    }
    this.activeByWC.clear();
  }

  cleanupWC(wc: WebContents) {
    // Remove WC association on destroy
    try {
      this.activeByWC.delete(wc.id);
    } catch {}
  }
}
