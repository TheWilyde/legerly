import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mockState = vi.hoisted(() => ({
  userDataDir: '',
  tempDir: '',
  profileKeyStore: new Map<string, string>(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return mockState.userDataDir;
      if (name === 'temp') return mockState.tempDir;
      return mockState.userDataDir;
    },
    getVersion: () => 'test-version',
  },
  dialog: {
    showOpenDialog: mockState.showOpenDialog,
    showSaveDialog: mockState.showSaveDialog,
  },
  BrowserWindow: class BrowserWindow {},
}));

vi.mock('../encryption', () => {
  const encrypt = (value: string) => `enc:${value}`;
  const decrypt = (value: string) =>
    value.startsWith('enc:') ? value.slice(4) : value;

  return {
    encryptionService: {
      exportProfileKey: vi.fn(async (profileId: string) => {
        return mockState.profileKeyStore.get(profileId) ?? null;
      }),
      importProfileKey: vi.fn(async (profileId: string, keyHex: string) => {
        mockState.profileKeyStore.set(profileId, keyHex);
      }),
      encrypt: vi.fn((plaintext: string) => encrypt(plaintext)),
      decrypt: vi.fn((ciphertext: string) => decrypt(ciphertext)),
      isEncrypted: vi.fn((value: string) => value.startsWith('enc:')),
      encryptFields: vi.fn(
        <T extends Record<string, any>>(obj: T, fields: readonly (keyof T)[]) => {
          const result = {...obj};
          for (const field of fields) {
            const value = result[field];
            if (typeof value === 'string' && value.length > 0) {
              result[field] = encrypt(value) as T[keyof T];
            }
          }
          return result;
        },
      ),
      decryptFields: vi.fn(
        <T extends Record<string, any>>(obj: T, fields: readonly (keyof T)[]) => {
          const result = {...obj};
          for (const field of fields) {
            const value = result[field];
            if (typeof value === 'string') {
              result[field] = decrypt(value) as T[keyof T];
            }
          }
          return result;
        },
      ),
    },
  };
});

import {
  closePeriod,
  createStock,
  ensureSchema,
  getActivePeriod,
  saveInvoice,
} from '../db';
import {documentManager} from '../document-manager';
import {ErrorCodes} from '../errors';

type ArchivePayload = {
  meta: {
    magic: string;
    createdAt: string;
    profileCount: number;
    appVersion?: string;
    source: string;
  };
  profiles: Array<{
    id: string;
    name: string;
    createdAt: string;
    lastOpened: string;
    hasPassword: boolean;
    color: string;
    metadata: unknown;
    databaseBase64: string;
    encryptionKeyHex: string | null;
  }>;
};

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function readArchive(filePath: string): ArchivePayload {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ArchivePayload;
}

function readArchivedInvoiceCount(filePath: string, profileId: string): number {
  const archive = readArchive(filePath);
  const profile = archive.profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Archived profile not found: ${profileId}`);
  }

  const inspectDir = makeTempDir('legerly-archive-inspect-');
  const dbPath = path.join(inspectDir, `${profileId}.db`);
  fs.writeFileSync(dbPath, Buffer.from(profile.databaseBase64, 'base64'));

  const db = new Database(dbPath);
  try {
    const row = db
      .prepare('SELECT COUNT(1) AS count FROM invoices')
      .get() as {count: number};
    return Number(row.count ?? 0);
  } finally {
    db.close();
  }
}

function seedProfileWorkspace(
  profileId: string,
  options: {closeCurrentPeriod?: boolean; keyHex?: string} = {},
): {dbPath: string; encryptionKey: Buffer} {
  const profilesRoot = path.join(mockState.userDataDir, 'profiles');
  const profileDir = path.join(profilesRoot, profileId);
  fs.mkdirSync(profileDir, {recursive: true});

  const metadata = {
    name: `Profile ${profileId}`,
    createdAt: new Date().toISOString(),
    lastOpened: new Date().toISOString(),
    hasPassword: false,
    color: '#3b82f6',
  };

  fs.writeFileSync(
    path.join(profileDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8',
  );

  const dbPath = path.join(profileDir, 'data.db');
  const db = new Database(dbPath);
  const encryptionKey = Buffer.alloc(
    32,
    (profileId.charCodeAt(profileId.length - 1) % 20) + 1,
  );

  try {
    ensureSchema(db);

    createStock(
      {
        code: `${profileId.toUpperCase()}-SKU-1`,
        name: `${profileId} item`,
        purchaseRate: 110,
        purchaseQty: 4,
        saleRate: 140,
        saleQty: 1,
      },
      db,
      encryptionKey,
    );

    const active = getActivePeriod(db);
    if (!active) {
      throw new Error('Expected active period during seed');
    }

    saveInvoice(
      {
        number: '1001',
        supplierName: `Supplier ${profileId}`,
        total: 220,
        invoiceDate: active.startDate,
        items: [
          {
            code: `${profileId.toUpperCase()}-SKU-1`,
            name: `${profileId} item`,
            rate: 110,
            qty: 2,
            position: 0,
          },
        ],
        status: 'posted',
      },
      db,
      encryptionKey,
    );

    if (options.closeCurrentPeriod) {
      closePeriod({periodId: active.id}, db);
    }
  } finally {
    db.close();
  }

  mockState.profileKeyStore.set(profileId, options.keyHex ?? `key-${profileId}`);

  return {dbPath, encryptionKey};
}

describe('document archive (.biz)', () => {
  beforeEach(() => {
    const root = makeTempDir('legerly-document-archive-');
    mockState.userDataDir = root;
    mockState.tempDir = path.join(root, 'temp');
    fs.mkdirSync(path.join(root, 'profiles'), {recursive: true});
    fs.mkdirSync(mockState.tempDir, {recursive: true});
    mockState.profileKeyStore.clear();
    mockState.showOpenDialog.mockReset();
    mockState.showSaveDialog.mockReset();
    documentManager.closeDocument();
  });

  afterEach(() => {
    documentManager.closeDocument();

    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('save-as archives every profile database plus metadata and profile keys', async () => {
    seedProfileWorkspace('profile-a', {closeCurrentPeriod: true, keyHex: 'aa11'});
    seedProfileWorkspace('profile-b', {closeCurrentPeriod: false, keyHex: 'bb22'});

    const archivePath = path.join(
      makeTempDir('legerly-document-export-'),
      'workspace.biz',
    );

    const result = await documentManager.saveDocumentAs(undefined, archivePath);

    expect(result?.path).toBe(archivePath);
    expect(result?.isDirty).toBe(false);

    const archive = readArchive(archivePath);
    expect(archive.meta.magic).toBe('LEDGERLY_BIZ_ARCHIVE_V1');
    expect(archive.meta.profileCount).toBe(2);

    const profileIds = archive.profiles.map((profile) => profile.id).sort();
    expect(profileIds).toEqual(['profile-a', 'profile-b']);

    const archivedA = archive.profiles.find((profile) => profile.id === 'profile-a');
    const archivedB = archive.profiles.find((profile) => profile.id === 'profile-b');

    expect(archivedA?.databaseBase64.length).toBeGreaterThan(0);
    expect(archivedB?.databaseBase64.length).toBeGreaterThan(0);
    expect(archivedA?.encryptionKeyHex).toBe('aa11');
    expect(archivedB?.encryptionKeyHex).toBe('bb22');
  });

  it('open restores archived workspace data so invoices and closed periods remain usable', async () => {
    seedProfileWorkspace('profile-a', {closeCurrentPeriod: true, keyHex: 'aa11'});
    seedProfileWorkspace('profile-b', {closeCurrentPeriod: false, keyHex: 'bb22'});

    const archivePath = path.join(
      makeTempDir('legerly-document-open-'),
      'workspace.biz',
    );

    await documentManager.saveDocumentAs(undefined, archivePath);

    fs.rmSync(path.join(mockState.userDataDir, 'profiles'), {
      recursive: true,
      force: true,
    });
    fs.mkdirSync(path.join(mockState.userDataDir, 'profiles'), {recursive: true});
    mockState.profileKeyStore.clear();

    const opened = await documentManager.openDocument(archivePath);
    expect(opened.path).toBe(archivePath);

    const restoredDbPath = path.join(
      mockState.userDataDir,
      'profiles',
      'profile-a',
      'data.db',
    );

    expect(fs.existsSync(restoredDbPath)).toBe(true);

    const restoredDb = new Database(restoredDbPath);
    try {
      const invoiceCount = Number(
        (
          restoredDb
            .prepare('SELECT COUNT(1) AS count FROM invoices')
            .get() as {count: number}
        ).count,
      );

      const closedPeriodCount = Number(
        (
          restoredDb
            .prepare("SELECT COUNT(1) AS count FROM periods WHERE status = 'closed'")
            .get() as {count: number}
        ).count,
      );

      const snapshotItemCount = Number(
        (
          restoredDb
            .prepare('SELECT COUNT(1) AS count FROM stock_snapshot_items')
            .get() as {count: number}
        ).count,
      );

      expect(invoiceCount).toBeGreaterThan(0);
      expect(closedPeriodCount).toBeGreaterThan(0);
      expect(snapshotItemCount).toBeGreaterThan(0);
    } finally {
      restoredDb.close();
    }

    expect(mockState.profileKeyStore.get('profile-a')).toBe('aa11');
    expect(mockState.profileKeyStore.get('profile-b')).toBe('bb22');
  });

  it('save updates existing archive with latest workspace changes', async () => {
    const seeded = seedProfileWorkspace('profile-a', {
      closeCurrentPeriod: false,
      keyHex: 'aa11',
    });

    const archivePath = path.join(
      makeTempDir('legerly-document-save-'),
      'workspace.biz',
    );

    await documentManager.saveDocumentAs(undefined, archivePath);
    const beforeCount = readArchivedInvoiceCount(archivePath, 'profile-a');

    const db = new Database(seeded.dbPath);
    try {
      const active = getActivePeriod(db);
      if (!active) {
        throw new Error('Expected active period before update');
      }

      saveInvoice(
        {
          number: '1002',
          supplierName: 'Supplier profile-a (extra)',
          total: 300,
          invoiceDate: active.startDate,
          items: [
            {
              code: 'PROFILE-A-SKU-1',
              name: 'profile-a item',
              rate: 150,
              qty: 2,
              position: 0,
            },
          ],
          status: 'posted',
        },
        db,
        seeded.encryptionKey,
      );
    } finally {
      db.close();
    }

    documentManager.markDirty(true);
    await documentManager.saveDocument();

    const afterCount = readArchivedInvoiceCount(archivePath, 'profile-a');
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  it('rejects malformed .biz archives', async () => {
    const badArchivePath = path.join(
      makeTempDir('legerly-document-invalid-'),
      'broken.biz',
    );

    fs.writeFileSync(badArchivePath, '{not-json', 'utf8');

    await expect(documentManager.openDocument(badArchivePath)).rejects.toMatchObject({
      code: ErrorCodes.INVALID_INPUT,
    });
  });
});
