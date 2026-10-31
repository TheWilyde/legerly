export type UpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  error?: string;
  lastCheckedAt?: string;
  progress?: UpdateProgress;
}

export interface CompatibilityResult {
  compatible: boolean;
  highestLocalSchema: number;
  minReadableSchema: number;
  maxReadableSchema: number;
  reason?: string;
}

export interface ReleaseOption {
  version: string;
  publishedAt: string;
  notesUrl: string;
  installerSize: number;
  architecture: "x64";
  isCurrent: boolean;
  isNewer: boolean;
  compatibility: CompatibilityResult;
}

export interface ReleaseCatalogEntry {
  version: string;
  publishedAt: string;
  notesUrl: string;
  feedUrl: string;
  installerSize: number;
  architecture: "x64";
  minReadableSchema: number;
  maxReadableSchema: number;
}

export interface VersionCatalog {
  formatVersion: 1;
  generatedAt: string;
  releases: ReleaseCatalogEntry[];
}

