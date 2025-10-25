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

    const profileKey = await encryptionService.getProfileKey(profileId);

    ensureSchema(db);

    this.connections.set(profileId, {db, encryptionKey: profileKey});

    profile.lastOpened = new Date().toISOString();
    this.updateProfileMetadata(profile);
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
    const metadata: ProfileMetadata = {
      name: profile.name,
      createdAt: profile.createdAt,
      lastOpened: profile.lastOpened,
      hasPassword: profile.hasPassword,
    };

    fs.writeFileSync(
      path.join(profile.path, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
  }
}

export default ProfileManager;
