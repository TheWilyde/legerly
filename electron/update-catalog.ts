import { createPublicKey, verify } from "node:crypto";
import type { ReleaseCatalogEntry, VersionCatalog } from "./update-types";

const OWNER = "TheWilyde";
const REPOSITORY = "legerly";

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Invalid stable version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function isReleaseEntry(value: unknown): value is ReleaseCatalogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.version === "string" &&
    /^\d+\.\d+\.\d+$/.test(entry.version) &&
    typeof entry.publishedAt === "string" &&
    typeof entry.notesUrl === "string" &&
    typeof entry.feedUrl === "string" &&
    entry.feedUrl ===
      `https://github.com/${OWNER}/${REPOSITORY}/releases/download/v${entry.version}` &&
    typeof entry.installerSize === "number" &&
    entry.installerSize > 0 &&
    entry.architecture === "x64" &&
    Number.isInteger(entry.minReadableSchema) &&
    Number.isInteger(entry.maxReadableSchema) &&
    Number(entry.minReadableSchema) >= 0 &&
    Number(entry.maxReadableSchema) >= Number(entry.minReadableSchema)
  );
}

export function parseAndValidateCatalog(bytes: Uint8Array): VersionCatalog {
  const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("The release catalog is not an object.");
  const catalog = parsed as Partial<VersionCatalog>;
  if (
    catalog.formatVersion !== 1 ||
    typeof catalog.generatedAt !== "string" ||
    !Array.isArray(catalog.releases) ||
    catalog.releases.length < 1 ||
    catalog.releases.length > 4 ||
    !catalog.releases.every(isReleaseEntry)
  ) {
    throw new Error("The release catalog has an invalid format.");
  }
  for (let index = 1; index < catalog.releases.length; index += 1) {
    if (compareVersions(catalog.releases[index - 1].version, catalog.releases[index].version) <= 0) {
      throw new Error("The release catalog is not ordered newest first.");
    }
  }
  return catalog as VersionCatalog;
}

export function verifyCatalogSignature(
  bytes: Uint8Array,
  signature: Uint8Array,
  publicKeyBase64: string,
): boolean {
  if (!publicKeyBase64) return false;
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, Buffer.from(bytes), key, Buffer.from(signature));
}
