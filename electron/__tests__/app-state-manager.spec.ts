import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import AppStateManager from '../app-state-manager';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legerly-app-state-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

describe('AppStateManager', () => {
  it('normalizes stale lastActiveProfile and bounds on load', () => {
    const dataDir = makeTempDir();
    const statePath = path.join(dataDir, 'app-state.json');

    fs.writeFileSync(
      statePath,
      JSON.stringify({
        openProfiles: [
          {
            profileId: 'p-1',
            windowIndex: 0,
            isActive: false,
            lastFocusedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        lastActiveProfile: 'missing-profile',
        windowBounds: {width: -10, height: 0},
        version: '1.0.0',
      }),
      'utf8',
    );

    const manager = new AppStateManager(dataDir);

    expect(manager.getOpenProfiles()).toEqual(['p-1']);
    expect(manager.getLastActiveProfile()).toBe('p-1');
    expect(manager.getWindowBounds()).toEqual({
      width: 1200,
      height: 800,
      x: undefined,
      y: undefined,
    });
  });

  it('ignores setActiveProfile for non-open profile', () => {
    const dataDir = makeTempDir();
    const manager = new AppStateManager(dataDir);

    manager.addOpenProfile('p-1');
    expect(manager.getLastActiveProfile()).toBe('p-1');

    manager.setActiveProfile('p-2');
    expect(manager.getLastActiveProfile()).toBe('p-1');
  });

  it('reassigns active profile after removing current active', () => {
    const dataDir = makeTempDir();
    const manager = new AppStateManager(dataDir);

    manager.addOpenProfile('p-1');
    manager.addOpenProfile('p-2');
    manager.setActiveProfile('p-2');

    expect(manager.getLastActiveProfile()).toBe('p-2');

    manager.removeOpenProfile('p-2');

    expect(manager.getOpenProfiles()).toEqual(['p-1']);
    expect(manager.getLastActiveProfile()).toBe('p-1');
  });

  it('falls back to defaults on invalid JSON', () => {
    const dataDir = makeTempDir();
    const statePath = path.join(dataDir, 'app-state.json');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      fs.writeFileSync(statePath, '{ bad json', 'utf8');

      const manager = new AppStateManager(dataDir);

      expect(manager.getOpenProfiles()).toEqual([]);
      expect(manager.getLastActiveProfile()).toBeNull();
      expect(manager.getWindowBounds()).toEqual({width: 1200, height: 800});
    } finally {
      errorSpy.mockRestore();
    }
  });
});
