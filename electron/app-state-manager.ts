import fs from 'node:fs';
import path from 'node:path';
import type {AppState} from './types';

class AppStateManager {
  private statePath: string;
  private state: AppState;

  constructor(dataDir: string) {
    this.statePath = path.join(dataDir, 'app-state.json');
    this.state = this.loadState();
  }

  private defaultState(): AppState {
    return {
      openProfiles: [],
      lastActiveProfile: null,
      windowBounds: {width: 1200, height: 800},
      version: '1.0.0',
    };
  }

  private normalizeState(raw: unknown): AppState {
    const fallback = this.defaultState();

    if (!raw || typeof raw !== 'object') {
      return fallback;
    }

    const candidate = raw as {
      openProfiles?: unknown;
      lastActiveProfile?: unknown;
      windowBounds?: {
        width?: unknown;
        height?: unknown;
        x?: unknown;
        y?: unknown;
      };
      version?: unknown;
    };

    const seen = new Set<string>();
    const openProfiles = Array.isArray(candidate.openProfiles)
      ? candidate.openProfiles
          .filter(
            (
              item,
            ): item is {
              profileId?: unknown;
              windowIndex?: unknown;
              lastFocusedAt?: unknown;
            } => {
              return !!item && typeof item === 'object';
            },
          )
          .map((item) => ({
            profileId:
              typeof item.profileId === 'string' ? item.profileId.trim() : '',
            windowIndex:
              typeof item.windowIndex === 'number' &&
              Number.isFinite(item.windowIndex)
                ? item.windowIndex
                : 0,
            lastFocusedAt:
              typeof item.lastFocusedAt === 'string' &&
              item.lastFocusedAt.trim()
                ? item.lastFocusedAt
                : new Date().toISOString(),
          }))
          .filter((item) => {
            if (!item.profileId || seen.has(item.profileId)) {
              return false;
            }
            seen.add(item.profileId);
            return true;
          })
          .map((item) => ({
            profileId: item.profileId,
            windowIndex: item.windowIndex,
            isActive: false,
            lastFocusedAt: item.lastFocusedAt,
          }))
      : [];

    const width =
      typeof candidate.windowBounds?.width === 'number' &&
      Number.isFinite(candidate.windowBounds.width) &&
      candidate.windowBounds.width > 0
        ? candidate.windowBounds.width
        : fallback.windowBounds.width;

    const height =
      typeof candidate.windowBounds?.height === 'number' &&
      Number.isFinite(candidate.windowBounds.height) &&
      candidate.windowBounds.height > 0
        ? candidate.windowBounds.height
        : fallback.windowBounds.height;

    const x =
      typeof candidate.windowBounds?.x === 'number' &&
      Number.isFinite(candidate.windowBounds.x)
        ? candidate.windowBounds.x
        : undefined;

    const y =
      typeof candidate.windowBounds?.y === 'number' &&
      Number.isFinite(candidate.windowBounds.y)
        ? candidate.windowBounds.y
        : undefined;

    let lastActiveProfile =
      typeof candidate.lastActiveProfile === 'string' &&
      candidate.lastActiveProfile.trim()
        ? candidate.lastActiveProfile
        : null;

    if (
      !lastActiveProfile ||
      !openProfiles.some((item) => item.profileId === lastActiveProfile)
    ) {
      lastActiveProfile = openProfiles[0]?.profileId ?? null;
    }

    const normalizedOpenProfiles = openProfiles.map((item) => ({
      ...item,
      isActive: !!lastActiveProfile && item.profileId === lastActiveProfile,
    }));

    return {
      openProfiles: normalizedOpenProfiles,
      lastActiveProfile,
      windowBounds: {width, height, x, y},
      version:
        typeof candidate.version === 'string' && candidate.version.trim()
          ? candidate.version
          : fallback.version,
    };
  }

  private loadState(): AppState {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf8');
        return this.normalizeState(JSON.parse(raw));
      }
    } catch (err) {
      console.error('Failed to load app state:', err);
    }

    return this.defaultState();
  }

  private saveState(): void {
    try {
      fs.writeFileSync(
        this.statePath,
        JSON.stringify(this.state, null, 2),
        'utf8',
      );
    } catch (err) {
      console.error('Failed to save app state:', err);
    }
  }

  getOpenProfiles(): string[] {
    return this.state.openProfiles.map((p) => p.profileId);
  }

  getLastActiveProfile(): string | null {
    return this.state.lastActiveProfile;
  }

  setOpenProfiles(profileIds: string[]): void {
    this.state.openProfiles = profileIds.map((id, index) => ({
      profileId: id,
      windowIndex: 0,
      isActive: index === 0,
      lastFocusedAt: new Date().toISOString(),
    }));
    this.state.lastActiveProfile = profileIds[0] ?? null;
    this.saveState();
  }

  setActiveProfile(profileId: string): void {
    if (!this.state.openProfiles.some((p) => p.profileId === profileId)) {
      return;
    }

    this.state.lastActiveProfile = profileId;
    this.state.openProfiles = this.state.openProfiles.map((p) => ({
      ...p,
      isActive: p.profileId === profileId,
      lastFocusedAt:
        p.profileId === profileId ? new Date().toISOString() : p.lastFocusedAt,
    }));
    this.saveState();
  }

  addOpenProfile(profileId: string): void {
    if (!this.state.openProfiles.find((p) => p.profileId === profileId)) {
      this.state.openProfiles.push({
        profileId,
        windowIndex: 0,
        isActive: this.state.openProfiles.length === 0,
        lastFocusedAt: new Date().toISOString(),
      });

      if (this.state.openProfiles.length === 1) {
        this.state.lastActiveProfile = profileId;
      }

      this.saveState();
    }
  }

  removeOpenProfile(profileId: string): void {
    this.state.openProfiles = this.state.openProfiles.filter(
      (p) => p.profileId !== profileId,
    );

    if (
      this.state.lastActiveProfile === profileId ||
      !this.state.openProfiles.some(
        (p) => p.profileId === this.state.lastActiveProfile,
      )
    ) {
      this.state.lastActiveProfile =
        this.state.openProfiles[0]?.profileId || null;
    }

    this.state.openProfiles = this.state.openProfiles.map((p) => ({
      ...p,
      isActive:
        this.state.lastActiveProfile !== null &&
        p.profileId === this.state.lastActiveProfile,
    }));

    this.saveState();
  }

  getWindowBounds() {
    return this.state.windowBounds;
  }

  setWindowBounds(bounds: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  }) {
    this.state.windowBounds = bounds;
    this.saveState();
  }

  clearState(): void {
    this.state = this.defaultState();
    this.saveState();
  }
}

export default AppStateManager;
