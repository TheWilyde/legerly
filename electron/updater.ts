import { BrowserWindow, app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import log from "./logger";
import type {
  CompatibilityResult,
  ReleaseCatalogEntry,
  ReleaseOption,
  UpdateProgress,
  UpdateState,
  VersionCatalog,
} from "./update-types";
import {
  compareVersions,
  parseAndValidateCatalog,
  verifyCatalogSignature,
} from "./update-catalog";

const OWNER = "TheWilyde";
const REPOSITORY = "legerly";
const CATALOG_URL = `https://github.com/${OWNER}/${REPOSITORY}/releases/latest/download/version-catalog.json`;
const CATALOG_SIGNATURE_URL = `${CATALOG_URL}.sig`;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 10_000;
const CATALOG_PUBLIC_KEY = String(
  import.meta.env.VITE_LEDGERLY_CATALOG_PUBLIC_KEY ?? "",
).trim();

let initialized = false;
let handlersRegistered = false;
let verifiedCatalog: VersionCatalog | undefined;
let selectedReleaseVersion: string | undefined;
let state: UpdateState = { status: "idle", currentVersion: "0.0.0" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emitState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("updates:state", state);
    if (patch.progress) window.webContents.send("updates:progress", patch.progress);
  }
}

async function fetchCatalog(): Promise<VersionCatalog> {
  const headers = { "User-Agent": `Ledgerly/${app.getVersion()}` };
  const [catalogResponse, signatureResponse] = await Promise.all([
    fetch(CATALOG_URL, { headers, redirect: "follow" }),
    fetch(CATALOG_SIGNATURE_URL, { headers, redirect: "follow" }),
  ]);
  if (!catalogResponse.ok || !signatureResponse.ok) {
    throw new Error("The signed release catalog is unavailable.");
  }
  const bytes = new Uint8Array(await catalogResponse.arrayBuffer());
  const signature = new Uint8Array(await signatureResponse.arrayBuffer());
  if (!verifyCatalogSignature(bytes, signature, CATALOG_PUBLIC_KEY)) {
    throw new Error("The release catalog signature is invalid.");
  }
  verifiedCatalog = parseAndValidateCatalog(bytes);
  return verifiedCatalog;
}

function readHighestLocalSchema(): number {
  const profilesDirectory = path.join(app.getPath("userData"), "profiles");
  if (!fs.existsSync(profilesDirectory)) return 0;
  let highest = 0;
  for (const directory of fs.readdirSync(profilesDirectory, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const databasePath = path.join(profilesDirectory, directory.name, "data.db");
    if (!fs.existsSync(databasePath)) continue;
    let database: Database.Database | undefined;
    try {
      database = new Database(databasePath, { readonly: true, fileMustExist: true });
      const hasTable = database.prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_schema'`,
      ).get();
      if (!hasTable) continue;
      const row = database.prepare(`SELECT version FROM app_schema WHERE id = 1`).get() as
        | { version?: number }
        | undefined;
      highest = Math.max(highest, Number(row?.version ?? 0));
    } catch (error) {
      log.warn(`[updater] Could not inspect ${databasePath}:`, error);
    } finally {
      database?.close();
    }
  }
  return highest;
}

function compatibilityFor(
  release: ReleaseCatalogEntry,
  highestLocalSchema: number,
): CompatibilityResult {
  const compatible =
    highestLocalSchema >= release.minReadableSchema &&
    highestLocalSchema <= release.maxReadableSchema;
  return {
    compatible,
    highestLocalSchema,
    minReadableSchema: release.minReadableSchema,
    maxReadableSchema: release.maxReadableSchema,
    reason: compatible
      ? undefined
      : `Local data uses schema ${highestLocalSchema}; Ledgerly ${release.version} supports schemas ${release.minReadableSchema}-${release.maxReadableSchema}.`,
  };
}

async function listVersions(): Promise<ReleaseOption[]> {
  const catalog = await fetchCatalog();
  const currentVersion = app.getVersion();
  const highestLocalSchema = readHighestLocalSchema();
  return catalog.releases.map((release) => ({
    version: release.version,
    publishedAt: release.publishedAt,
    notesUrl: release.notesUrl,
    installerSize: release.installerSize,
    architecture: release.architecture,
    isCurrent: compareVersions(release.version, currentVersion) === 0,
    isNewer: compareVersions(release.version, currentVersion) > 0,
    compatibility: compatibilityFor(release, highestLocalSchema),
  }));
}

function restoreDefaultFeed() {
  autoUpdater.allowDowngrade = false;
  selectedReleaseVersion = undefined;
  autoUpdater.setFeedURL({ provider: "github", owner: OWNER, repo: REPOSITORY });
}

async function checkForLatest() {
  if (!app.isPackaged) return state;
  if (["downloading", "downloaded", "installing"].includes(state.status)) return state;
  restoreDefaultFeed();
  emitState({ status: "checking", error: undefined });
  await autoUpdater.checkForUpdates();
  return state;
}

async function installVersion(version: string) {
  compareVersions(version, version);
  if (!app.isPackaged) throw new Error("Version installation requires a packaged app.");
  const catalog = verifiedCatalog ?? (await fetchCatalog());
  const release = catalog.releases.find((entry) => entry.version === version);
  if (!release) throw new Error("That release is not in the signed catalog.");
  if (version === app.getVersion()) throw new Error("The currently running version is already installed.");
  const compatibility = compatibilityFor(release, readHighestLocalSchema());
  if (!compatibility.compatible) throw new Error(compatibility.reason);

  selectedReleaseVersion = version;
  autoUpdater.allowDowngrade = compareVersions(version, app.getVersion()) < 0;
  autoUpdater.setFeedURL({ provider: "generic", url: release.feedUrl });
  emitState({ status: "checking", availableVersion: version, error: undefined });
  try {
    const result = await autoUpdater.checkForUpdates();
    const resolvedVersion = result?.updateInfo.version;
    if (resolvedVersion !== version) {
      throw new Error(`Expected release ${version}, but the feed returned ${resolvedVersion ?? "nothing"}.`);
    }
    return state;
  } catch (error) {
    restoreDefaultFeed();
    throw error;
  }
}

function registerHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  ipcMain.handle("updates:get-state", () => state);
  ipcMain.handle("updates:check", () => checkForLatest());
  ipcMain.handle("updates:list-versions", () => listVersions());
  ipcMain.handle("updates:download-latest", () => checkForLatest());
  ipcMain.handle("updates:install-downloaded", () => {
    if (state.status !== "downloaded") throw new Error("No verified update is ready to install.");
    emitState({ status: "installing" });
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.handle("updates:install-version", (_event, version: unknown) => {
    if (typeof version !== "string") throw new Error("Invalid release version.");
    return installVersion(version);
  });
}

function bindUpdaterEvents() {
  autoUpdater.on("error", (error) => {
    log.error("[updater] error:", error);
    emitState({ status: "error", error: errorMessage(error) });
    if (selectedReleaseVersion) restoreDefaultFeed();
  });
  autoUpdater.on("checking-for-update", () => emitState({ status: "checking", error: undefined }));
  autoUpdater.on("update-available", (info: UpdateInfo) => {
    emitState({ status: "downloading", availableVersion: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    emitState({ status: "idle", availableVersion: undefined, lastCheckedAt: new Date().toISOString() });
  });
  autoUpdater.on("download-progress", (progress) => {
    const normalized: UpdateProgress = {
      percent: Math.max(0, Math.min(100, progress.percent)),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    };
    emitState({ status: "downloading", progress: normalized });
  });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    emitState({
      status: "downloaded",
      availableVersion: info.version,
      progress: undefined,
      lastCheckedAt: new Date().toISOString(),
    });
  });
}

export function initAutoUpdater() {
  registerHandlers();
  state = { ...state, currentVersion: app.getVersion() };
  if (initialized) return;
  initialized = true;
  if (!app.isPackaged) {
    emitState({ status: "disabled" });
    return;
  }
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  bindUpdaterEvents();
  setTimeout(() => void checkForLatest().catch((error) => {
    emitState({ status: "error", error: errorMessage(error) });
  }), STARTUP_CHECK_DELAY_MS);
  const timer = setInterval(() => void checkForLatest().catch((error) => {
    log.warn("[updater] Scheduled check failed:", error);
  }), CHECK_INTERVAL_MS);
  timer.unref();
}
