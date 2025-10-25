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

  private loadState(): AppState {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to load app state:', err);
    }

    return {
      openProfiles: [],
      lastActiveProfile: null,
      windowBounds: {width: 1200, height: 800},
      version: '1.0.0',
    };
  }

  private saveState(): void {
    try {
      fs.writeFileSync(
        this.statePath,
        JSON.stringify(this.state, null, 2),
        'utf8'
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
    this.saveState();
  }

  setActiveProfile(profileId: string): void {
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
      (p) => p.profileId !== profileId
    );

    if (this.state.lastActiveProfile === profileId) {
      this.state.lastActiveProfile =
        this.state.openProfiles[0]?.profileId || null;
    }

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
    this.state = {
      openProfiles: [],
      lastActiveProfile: null,
      windowBounds: {width: 1200, height: 800},
      version: '1.0.0',
    };
    this.saveState();
  }
}

export default AppStateManager;
