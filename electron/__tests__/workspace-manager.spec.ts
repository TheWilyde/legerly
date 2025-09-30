import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { WorkspaceManager } from '../workspace-manager';
import type { WebContents } from 'electron';

vi.mock('electron', async () => {
  const actual = await vi.importActual<any>('electron');
  return {
    ...actual,
    app: {
      getPath: (name: string) => {
        if (name === 'userData') return path.join(os.tmpdir(), 'bm-test-userdata');
        if (name === 'documents') return path.join(os.tmpdir(), 'bm-test-docs');
        return os.tmpdir();
      }
    }
  };
});

function fakeWC(id: number): WebContents {
  return { id } as unknown as WebContents;
}

describe('WorkspaceManager', () => {
  const defs = [
    { id: 'w1', name: 'One', file: 'w1.sqlite' },
    { id: 'w2', name: 'Two', file: 'w2.sqlite' }
  ];
  let mgr: WorkspaceManager;

  beforeAll(async () => {
    mgr = new WorkspaceManager(200); // idle close fast for tests
    await mgr.initialize(defs);
  });

  afterAll(async () => {
    await mgr.cleanup();
    // cleanup temp dirs
    await fs.rm(path.join(os.tmpdir(), 'bm-test-userdata'), { recursive: true, force: true });
    await fs.rm(path.join(os.tmpdir(), 'bm-test-docs'), { recursive: true, force: true });
  });

  it('activates per WebContents and serves DB', () => {
    const wc = fakeWC(1);
    mgr.activate(wc, 'w2');
    const db = mgr.getDbFor(wc);
    expect(db.open).toBe(true);
  });

  it('backs up an opened workspace safely', async () => {
    const wc = fakeWC(2);
    mgr.activate(wc, 'w1');
    mgr.getDbFor(wc); // open it
    const target = await mgr.backup('w1');
    await expect(fs.access(target)).resolves.not.toThrow();
  });
});