import fs from "node:fs";
import path from "node:path";
import { promises as fsp } from "node:fs";
import Database from "better-sqlite3";
import { BrowserWindow, dialog, app } from "electron";
import { AppError, ErrorCodes } from "./errors";
import { encryptionService } from "./encryption";

const BIZ_EXTENSION = ".biz";
const BIZ_MAGIC = "LEDGERLY_BIZ_ARCHIVE_V1";

type ArchiveMeta = {
  magic: string;
  createdAt: string;
  profileCount: number;
  appVersion?: string;
  source: "profile-workspace-archive";
};

type ArchiveProfile = {
  id: string;
  name: string;
  createdAt: string;
  lastOpened: string;
  hasPassword: boolean;
  color: string;
  metadata: unknown;
  databaseBase64: string;
  encryptionKeyHex: string | null;
};

type ArchivePayload = {
  meta: ArchiveMeta;
  profiles: ArchiveProfile[];
};

export type DocumentInfo = {
  path: string;
  name: string;
  isDirty: boolean;
};

type OpenDocument = {
  path: string;
  isDirty: boolean;
};

function withBizExtension(filePath: string): string {
  if (filePath.toLowerCase().endsWith(BIZ_EXTENSION)) {
    return filePath;
  }
  return `${filePath}${BIZ_EXTENSION}`;
}

function isBizFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(BIZ_EXTENSION);
}

async function readArchivePayload(filePath: string): Promise<ArchivePayload> {
  const raw = await fsp.readFile(filePath, "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError(
      "Selected .biz file is invalid or corrupted.",
      ErrorCodes.INVALID_INPUT,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AppError(
      "Invalid .biz archive structure.",
      ErrorCodes.INVALID_INPUT,
    );
  }

  const payload = parsed as Partial<ArchivePayload>;
  if (!payload.meta || payload.meta.magic !== BIZ_MAGIC) {
    throw new AppError(
      "Unsupported .biz format. Expected Ledgerly archive file.",
      ErrorCodes.INVALID_INPUT,
    );
  }

  if (!Array.isArray(payload.profiles)) {
    throw new AppError(
      "Archive profiles list is missing.",
      ErrorCodes.INVALID_INPUT,
    );
  }

  return payload as ArchivePayload;
}

function toBase64FromFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString("base64");
}

async function exportDatabaseAsBase64(dbPath: string): Promise<string> {
  const tempRoot = fs.mkdtempSync(
    path.join(app.getPath("temp"), "ledgerly-biz-"),
  );
  const snapshotPath = path.join(tempRoot, "snapshot.db");
  const db = new Database(dbPath);

  try {
    db.pragma("wal_checkpoint(PASSIVE)");
    await db.backup(snapshotPath);
    return toBase64FromFile(snapshotPath);
  } finally {
    try {
      db.close();
    } catch {
      // no-op
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeBase64ToFile(base64: string, outputPath: string): void {
  const buffer = Buffer.from(base64, "base64");
  fs.writeFileSync(outputPath, buffer);
}

function getProfilesRootDir(): string {
  const profilesDir = path.join(app.getPath("userData"), "profiles");
  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }
  return profilesDir;
}

function getMetadata(profileDir: string): unknown {
  const metadataPath = path.join(profileDir, "metadata.json");
  if (!fs.existsSync(metadataPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch {
    return {};
  }
}

function getProfileDatabasePath(profileDir: string): string | null {
  const dbPath = path.join(profileDir, "data.db");
  if (fs.existsSync(dbPath)) {
    return dbPath;
  }
  return null;
}

function collectProfilesForArchive(profilesDir: string): Array<{
  id: string;
  dirPath: string;
  metadata: any;
  dbPath: string;
}> {
  if (!fs.existsSync(profilesDir)) {
    return [];
  }

  const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
  const profiles: Array<{
    id: string;
    dirPath: string;
    metadata: any;
    dbPath: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const id = entry.name;
    const dirPath = path.join(profilesDir, id);
    const metadata = getMetadata(dirPath) as any;
    const dbPath = getProfileDatabasePath(dirPath);

    if (!dbPath) continue;

    profiles.push({ id, dirPath, metadata, dbPath });
  }

  return profiles;
}

async function buildArchivePayload(): Promise<ArchivePayload> {
  const profilesDir = getProfilesRootDir();
  const profileRecords = collectProfilesForArchive(profilesDir);

  const profiles: ArchiveProfile[] = [];

  for (const record of profileRecords) {
    const metadata = record.metadata || {};
    const encryptionKeyHex = await encryptionService.exportProfileKey(
      record.id,
    );

    profiles.push({
      id: record.id,
      name: String(metadata.name ?? record.id),
      createdAt: String(metadata.createdAt ?? new Date().toISOString()),
      lastOpened: String(metadata.lastOpened ?? new Date().toISOString()),
      hasPassword: Boolean(metadata.hasPassword ?? false),
      color: String(metadata.color ?? "#3b82f6"),
      metadata,
      databaseBase64: await exportDatabaseAsBase64(record.dbPath),
      encryptionKeyHex,
    });
  }

  return {
    meta: {
      magic: BIZ_MAGIC,
      createdAt: new Date().toISOString(),
      profileCount: profiles.length,
      appVersion: app.getVersion(),
      source: "profile-workspace-archive",
    },
    profiles,
  };
}

async function writeArchiveToPath(filePath: string): Promise<void> {
  const payload = await buildArchivePayload();
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

async function importArchiveIntoWorkspace(
  payload: ArchivePayload,
): Promise<void> {
  const profilesDir = getProfilesRootDir();

  // Keep a recovery backup before replacing workspace
  if (fs.existsSync(profilesDir)) {
    const backupRoot = path.join(app.getPath("userData"), "profiles-backups");
    if (!fs.existsSync(backupRoot)) {
      fs.mkdirSync(backupRoot, { recursive: true });
    }

    const backupName = `profiles-before-import-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}`;
    const backupPath = path.join(backupRoot, backupName);
    fs.cpSync(profilesDir, backupPath, { recursive: true });
  }

  // Reset profiles folder then restore from archive
  fs.rmSync(profilesDir, { recursive: true, force: true });
  fs.mkdirSync(profilesDir, { recursive: true });

  for (const profile of payload.profiles) {
    const profileDir = path.join(profilesDir, profile.id);
    fs.mkdirSync(profileDir, { recursive: true });

    const metadataPath = path.join(profileDir, "metadata.json");
    const metadata =
      profile.metadata && typeof profile.metadata === "object"
        ? profile.metadata
        : {
            name: profile.name,
            createdAt: profile.createdAt,
            lastOpened: profile.lastOpened,
            hasPassword: profile.hasPassword,
            color: profile.color,
          };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    const dbPath = path.join(profileDir, "data.db");
    writeBase64ToFile(profile.databaseBase64, dbPath);

    if (profile.encryptionKeyHex) {
      await encryptionService.importProfileKey(
        profile.id,
        profile.encryptionKeyHex,
      );
    }
  }
}

export class DocumentManager {
  private current: OpenDocument | null = null;

  hasOpenDocument(): boolean {
    return this.current !== null;
  }

  getCurrentDocument(): DocumentInfo | null {
    if (!this.current) {
      return null;
    }

    return {
      path: this.current.path,
      name: path.basename(this.current.path),
      isDirty: this.current.isDirty,
    };
  }

  markDirty(isDirty = true): DocumentInfo | null {
    if (!this.current) {
      return null;
    }
    this.current.isDirty = isDirty;
    return this.getCurrentDocument();
  }

  closeDocument(): void {
    this.current = null;
  }

  createNewDocument(documentPath: string): DocumentInfo {
    const normalizedPath = withBizExtension(path.resolve(documentPath));
    const parent = path.dirname(normalizedPath);

    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    // New archive from current workspace state
    fs.writeFileSync(
      normalizedPath,
      JSON.stringify(
        {
          meta: {
            magic: BIZ_MAGIC,
            createdAt: new Date().toISOString(),
            profileCount: 0,
            appVersion: app.getVersion(),
            source: "profile-workspace-archive",
          },
          profiles: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    this.current = {
      path: normalizedPath,
      isDirty: false,
    };

    return this.getCurrentDocument() as DocumentInfo;
  }

  async openDocument(documentPath: string): Promise<DocumentInfo> {
    if (!isBizFile(documentPath)) {
      throw new AppError(
        "Unsupported document format. Please open a .biz file.",
        ErrorCodes.INVALID_INPUT,
      );
    }

    const normalizedPath = withBizExtension(path.resolve(documentPath));

    if (!fs.existsSync(normalizedPath)) {
      throw new AppError("Document file not found.", ErrorCodes.NOT_FOUND);
    }

    const payload = await readArchivePayload(normalizedPath);
    await importArchiveIntoWorkspace(payload);

    this.current = {
      path: normalizedPath,
      isDirty: false,
    };

    return this.getCurrentDocument() as DocumentInfo;
  }

  async createNewDocumentFromDialog(
    ownerWindow?: BrowserWindow,
  ): Promise<DocumentInfo | null> {
    const result = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, {
          title: "Create New Business Document",
          defaultPath: "untitled.biz",
          filters: [{ name: "Ledgerly Document", extensions: ["biz"] }],
          properties: ["createDirectory", "showOverwriteConfirmation"],
        })
      : await dialog.showSaveDialog({
          title: "Create New Business Document",
          defaultPath: "untitled.biz",
          filters: [{ name: "Ledgerly Document", extensions: ["biz"] }],
          properties: ["createDirectory", "showOverwriteConfirmation"],
        });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return this.createNewDocument(result.filePath);
  }

  async openDocumentFromDialog(
    ownerWindow?: BrowserWindow,
  ): Promise<DocumentInfo | null> {
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, {
          title: "Open Business Document",
          filters: [{ name: "Ledgerly Document", extensions: ["biz"] }],
          properties: ["openFile"],
        })
      : await dialog.showOpenDialog({
          title: "Open Business Document",
          filters: [{ name: "Ledgerly Document", extensions: ["biz"] }],
          properties: ["openFile"],
        });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return this.openDocument(result.filePaths[0]);
  }

  async saveDocument(): Promise<DocumentInfo> {
    if (!this.current) {
      throw new AppError("No open document to save.", ErrorCodes.NOT_FOUND);
    }

    await writeArchiveToPath(this.current.path);
    this.current.isDirty = false;
    return this.getCurrentDocument() as DocumentInfo;
  }

  async saveDocumentAs(
    ownerWindow?: BrowserWindow,
    targetPath?: string,
  ): Promise<DocumentInfo | null> {
    let destinationPath = targetPath;
    if (!destinationPath) {
      const defaultName = this.current
        ? path.basename(this.current.path)
        : "untitled.biz";
      const result = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, {
            title: "Save Business Document As",
            defaultPath: defaultName,
            filters: [{ name: "Ledgerly Document", extensions: ["biz"] }],
            properties: ["createDirectory", "showOverwriteConfirmation"],
          })
        : await dialog.showSaveDialog({
            title: "Save Business Document As",
            defaultPath: defaultName,
            filters: [{ name: "Ledgerly Document", extensions: ["biz"] }],
            properties: ["createDirectory", "showOverwriteConfirmation"],
          });

      if (result.canceled || !result.filePath) {
        return null;
      }

      destinationPath = result.filePath;
    }

    const normalizedPath = withBizExtension(path.resolve(destinationPath));
    const parent = path.dirname(normalizedPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    await writeArchiveToPath(normalizedPath);

    this.current = {
      path: normalizedPath,
      isDirty: false,
    };

    return this.getCurrentDocument();
  }

  // Compatibility shim: mutations route through profile manager connections.
  getConnection(): Database.Database | null {
    return null;
  }
}

export const documentManager = new DocumentManager();
