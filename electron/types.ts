export interface Profile {
  id: string; // UUID
  name: string; // User-friendly name
  createdAt: string; // ISO timestamp
  lastOpened: string; // ISO timestamp
  path: string; // Full path to profile folder
  hasPassword: boolean; // Future: password protection
}

export interface OpenProfile {
  profileId: string;
  windowIndex?: number; // Future: multi-window support
  isActive: boolean;
  lastFocusedAt: string;
}

export interface AppState {
  openProfiles: OpenProfile[];
  lastActiveProfile: string | null;
  windowBounds: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
  version: string;
}

export interface ProfileMetadata {
  name: string;
  createdAt: string;
  lastOpened: string;
  hasPassword: boolean;
}
