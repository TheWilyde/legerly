import crypto from "crypto";
import keytar from "keytar";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SERVICE_NAME = "ledgerly"; // ✅ Changed from 'bartan-markaz'
const ACCOUNT_NAME = "encryption-key";

class EncryptionService {
  private encryptionKey: Buffer | null = null;
  private activeProfileKey: Buffer | null = null;

  /**
   * Initialize encryption key from OS keychain/credential manager
   */
  async initialize(): Promise<void> {
    try {
      // Try to get key from OS secure storage
      let keyHex = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);

      if (!keyHex) {
        // Generate new key if none exists
        const key = crypto.randomBytes(KEY_LENGTH);
        keyHex = key.toString("hex");
        await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, keyHex);
        console.log(
          "✅ Generated new encryption key and stored in OS keychain",
        );
      } else {
        console.log("✅ Loaded encryption key from OS keychain");
      }

      this.encryptionKey = Buffer.from(keyHex, "hex");
    } catch (error) {
      console.error("Failed to initialize encryption:", error);
      throw new Error("Could not initialize encryption service");
    }
  }

  /**
   * Get or create profile-specific encryption key
   */
  async getProfileKey(profileId: string): Promise<Buffer> {
    const accountName = `profile-${profileId}`;
    let keyHex = await keytar.getPassword(SERVICE_NAME, accountName);

    if (!keyHex) {
      // Generate new key for this profile
      const key = crypto.randomBytes(KEY_LENGTH);
      keyHex = key.toString("hex");
      await keytar.setPassword(SERVICE_NAME, accountName, keyHex);
      console.log(`✅ Generated encryption key for profile: ${profileId}`);
    }

    return Buffer.from(keyHex, "hex");
  }

  /**
   * Delete profile encryption key
   */
  async deleteProfileKey(profileId: string): Promise<void> {
    const accountName = `profile-${profileId}`;
    await keytar.deletePassword(SERVICE_NAME, accountName);
    console.log(`🗑️ Deleted encryption key for profile: ${profileId}`);
  }

  /**
   * Export profile key as hex string (for document archive save)
   */
  async exportProfileKey(profileId: string): Promise<string | null> {
    const accountName = `profile-${profileId}`;
    const keyHex = await keytar.getPassword(SERVICE_NAME, accountName);
    return keyHex ?? null;
  }

  /**
   * Import profile key from hex string (for document archive open)
   */
  async importProfileKey(profileId: string, keyHex: string): Promise<void> {
    const normalized = String(keyHex ?? "").trim();
    if (!normalized) {
      return;
    }

    const accountName = `profile-${profileId}`;
    await keytar.setPassword(SERVICE_NAME, accountName, normalized);
  }

  /**
   * Set active profile key for current operations
   */
  setActiveKey(key: Buffer): void {
    this.activeProfileKey = key;
  }

  /**
   * Get app-level encryption key (used for document-mode storage)
   */
  getDefaultKey(): Buffer {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }
    return this.encryptionKey;
  }

  /**
   * Encrypt a string value
   */
  encrypt(plaintext: string, key?: Buffer): string {
    const encryptionKey = key || this.activeProfileKey || this.encryptionKey;

    if (!encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted value
   */
  decrypt(ciphertext: string, key?: Buffer): string {
    const encryptionKey = key || this.activeProfileKey || this.encryptionKey;

    if (!encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Check if a value is encrypted (starts with hex:hex:hex pattern)
   */
  isEncrypted(value: string): boolean {
    return /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(value);
  }

  /**
   * Encrypt an object (encrypts specified fields)
   */
  encryptFields<T extends Record<string, any>>(
    obj: T,
    fields: readonly (keyof T)[],
    key?: Buffer,
  ): T {
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] && typeof result[field] === "string") {
        result[field] = this.encrypt(result[field] as string, key) as any;
      }
    }
    return result;
  }

  /**
   * Decrypt an object (decrypts specified fields)
   */
  decryptFields<T extends Record<string, any>>(
    obj: T,
    fields: readonly (keyof T)[],
    key?: Buffer,
  ): T {
    const result = { ...obj };
    for (const field of fields) {
      if (
        result[field] &&
        typeof result[field] === "string" &&
        this.isEncrypted(result[field] as string)
      ) {
        try {
          result[field] = this.decrypt(result[field] as string, key) as any;
        } catch (err) {
          // If decryption fails, leave as-is (might be unencrypted legacy data)
          console.warn(`Failed to decrypt field ${String(field)}:`, err);
        }
      }
    }
    return result;
  }
}

export const encryptionService = new EncryptionService();
