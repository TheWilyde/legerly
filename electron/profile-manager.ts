import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {app} from 'electron';
import type {Profile, ProfileMetadata} from './types';
import {encryptionService} from './encryption';
import {ensureSchema} from './db';

class ProfileManager {
  private profiles: Map<string, Profile> = new Map();
  private connections: Map<
    string,
    {db: Database.Database; encryptionKey: Buffer}
  > = new Map();
  private profilesDir: string;

  constructor() {
    this.profilesDir = path.join(app.getPath('userData'), 'profiles');
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, {recursive: true});
    }
  }

  loadProfiles(): Profile[] {
    if (!fs.existsSync(this.profilesDir)) {
      return [];
    }

    const dirs = fs.readdirSync(this.profilesDir);
    const profiles: Profile[] = [];

    for (const dir of dirs) {
      const metadataPath = path.join(this.profilesDir, dir, 'metadata.json');

      if (fs.existsSync(metadataPath)) {
        try {
          const metadata: ProfileMetadata = JSON.parse(
            fs.readFileSync(metadataPath, 'utf8')
          );
          const profile: Profile = {
            id: dir,
            name: metadata.name,
            createdAt: metadata.createdAt,
            lastOpened: metadata.lastOpened,
            path: path.join(this.profilesDir, dir),
            hasPassword: metadata.hasPassword || false,
          };
          profiles.push(profile);
          this.profiles.set(profile.id, profile);
        } catch (err) {
          console.error(`Failed to load profile ${dir}:`, err);
        }
      }
    }

    return profiles;
  }

  hasProfiles(): boolean {
    return this.profiles.size > 0;
  }

  async createProfile(name: string, password?: string): Promise<Profile> {
    const id = `profile-${randomUUID()}`;
    const profilePath = path.join(this.profilesDir, id);

    fs.mkdirSync(profilePath, {recursive: true});

    const profile: Profile = {
      id,
      name,
      createdAt: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
      path: profilePath,
      hasPassword: !!password,
    };

    const metadata: ProfileMetadata = {
      name,
      createdAt: profile.createdAt,
      lastOpened: profile.lastOpened,
      hasPassword: profile.hasPassword,
    };

    fs.writeFileSync(
      path.join(profilePath, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    this.profiles.set(id, profile);

    // Generate and store encryption key
    await encryptionService.getProfileKey(id);

    return profile;
  }

  async openProfile(profileId: string): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    if (this.connections.has(profileId)) {
      return;
    }

    const dbPath = path.join(profile.path, 'data.db');
    const db = new Database(dbPath);

    // ✅ Enable WAL mode for crash resilience
    db.pragma('journal_mode = WAL');

    // ✅ Create a backup on open
    await this.backupProfileData(profile, db);

    const profileKey = await encryptionService.getProfileKey(profileId);

    ensureSchema(db);

    this.connections.set(profileId, {db, encryptionKey: profileKey});

    profile.lastOpened = new Date().toISOString();
    this.updateProfileMetadata(profile);
  }

  private async backupProfileData(
    profile: Profile,
    db: Database.Database
  ): Promise<void> {
    try {
      const backupsDir = path.join(profile.path, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, {recursive: true});
      }

      // Create backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupsDir, `data-${timestamp}.db`);

      // Use SQLite's online backup API
      await db.backup(backupPath);

      // Rotate backups: Keep last 10
      const files = fs
        .readdirSync(backupsDir)
        .filter((f) => f.startsWith('data-') && f.endsWith('.db'))
        .sort(); // Oldest first

      while (files.length > 10) {
        const fileToDelete = files.shift();
        if (fileToDelete) {
          fs.unlinkSync(path.join(backupsDir, fileToDelete));
        }
      }
    } catch (err) {
      console.error(`Failed to backup profile ${profile.name}:`, err);
    }
  }

  closeProfile(profileId: string): void {
    const connection = this.connections.get(profileId);
    if (connection) {
      connection.db.close();
      this.connections.delete(profileId);
    }
  }

  getConnection(profileId: string): Database.Database | undefined {
    return this.connections.get(profileId)?.db;
  }

  getEncryptionKey(profileId: string): Buffer | undefined {
    return this.connections.get(profileId)?.encryptionKey;
  }

  getProfile(profileId: string): Profile | undefined {
    return this.profiles.get(profileId);
  }

  listProfiles(): Profile[] {
    return Array.from(this.profiles.values()).sort(
      (a, b) =>
        new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    );
  }

  async deleteProfile(profileId: string): Promise<void> {
    this.closeProfile(profileId);

    const profile = this.profiles.get(profileId);
    if (profile) {
      // Delete folder
      fs.rmSync(profile.path, {recursive: true, force: true});

      // Delete encryption key
      await encryptionService.deleteProfileKey(profileId);

      this.profiles.delete(profileId);
    }
  }

  renameProfile(profileId: string, newName: string): void {
    const profile = this.profiles.get(profileId);
    if (profile) {
      profile.name = newName;
      this.updateProfileMetadata(profile);
    }
  }

  private updateProfileMetadata(profile: Profile): void {
    const metadataPath = path.join(profile.path, 'metadata.json');
    const metadata: ProfileMetadata = {
      name: profile.name,
      createdAt: profile.createdAt,
      lastOpened: profile.lastOpened,
      hasPassword: profile.hasPassword,
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Get list of available backups for a profile
   */
  getBackups(profileId: string): {filename: string; date: string; size: number}[] {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      return [];
    }

    const backupsDir = path.join(profile.path, 'backups');

    try {
      if (!fs.existsSync(backupsDir)) {
        return [];
      }

      const files = fs.readdirSync(backupsDir);
      return files
        .filter((f) => f.startsWith('data-') && f.endsWith('.db'))
        .map((filename) => {
          const filePath = path.join(backupsDir, filename);
          const stats = fs.statSync(filePath);
          
          // Extract date from filename: data-2024-01-15T10-30-00-000Z.db
          // Convert back to ISO format: 2024-01-15T10:30:00.000Z
          const dateMatch = filename.match(/data-(.+)\.db/);
          let dateStr = '';
          if (dateMatch) {
            const raw = dateMatch[1];
            // Format: 2024-01-15T10-30-00-000Z -> 2024-01-15T10:30:00.000Z
            const parts = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
            if (parts) {
              dateStr = `${parts[1]}T${parts[2]}:${parts[3]}:${parts[4]}.${parts[5]}Z`;
            } else {
              // Fallback: use file modification time
              dateStr = stats.mtime.toISOString();
            }
          } else {
            dateStr = stats.mtime.toISOString();
          }
          
          return {
            filename,
            date: dateStr,
            size: stats.size,
          };
        })
        .sort((a, b) => b.filename.localeCompare(a.filename)); // Most recent first
    } catch (err) {
      console.error('Failed to get backups:', err);
      return [];
    }
  }

  /**
   * Restore a backup for a profile
   */
  async restoreBackup(profileId: string, backupFilename: string): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const backupsDir = path.join(profile.path, 'backups');
    const backupPath = path.join(backupsDir, backupFilename);
    const dbPath = path.join(profile.path, 'data.db');

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupFilename}`);
    }

    // Close existing database connection if open
    const existingConn = this.connections.get(profileId);
    if (existingConn) {
      existingConn.db.close();
      this.connections.delete(profileId);
    }

    // Create a safety backup of current database before restoring
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const preRestoreBackup = path.join(backupsDir, `pre-restore-${timestamp}.db`);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, preRestoreBackup);
    }

    // Restore the backup
    fs.copyFileSync(backupPath, dbPath);

    // Reopen the profile with restored data
    await this.openProfile(profileId);
  }

  /**
   * Create a manual backup for a profile
   */
  async createManualBackup(profileId: string): Promise<{success: boolean; filename: string}> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const connection = this.connections.get(profileId);
    if (!connection) {
      throw new Error(`Profile not open: ${profileId}`);
    }

    const backupsDir = path.join(profile.path, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, {recursive: true});
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `data-${timestamp}.db`;
    const backupPath = path.join(backupsDir, filename);

    await connection.db.backup(backupPath);

    // Rotate backups: Keep last 10
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.startsWith('data-') && f.endsWith('.db'))
      .sort();

    while (files.length > 10) {
      const fileToDelete = files.shift();
      if (fileToDelete) {
        fs.unlinkSync(path.join(backupsDir, fileToDelete));
      }
    }

    return {success: true, filename};
  }
}

export default ProfileManager;
