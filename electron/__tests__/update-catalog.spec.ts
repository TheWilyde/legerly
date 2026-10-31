import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  compareVersions,
  parseAndValidateCatalog,
  verifyCatalogSignature,
} from "../update-catalog";

function catalogBytes(releases = ["1.1.3", "1.1.2", "1.1.1", "1.1.0"]) {
  return Buffer.from(JSON.stringify({
    formatVersion: 1,
    generatedAt: "2026-10-31T00:00:00.000Z",
    releases: releases.map((version) => ({
      version,
      publishedAt: "2026-10-31T00:00:00.000Z",
      notesUrl: `https://github.com/TheWilyde/legerly/releases/tag/v${version}`,
      feedUrl: `https://github.com/TheWilyde/legerly/releases/download/v${version}`,
      installerSize: 600_000_000,
      architecture: "x64",
      minReadableSchema: 0,
      maxReadableSchema: 4,
    })),
  }));
}

describe("update catalog", () => {
  it("compares stable versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
  });

  it("accepts only a newest-first four-version catalog", () => {
    expect(parseAndValidateCatalog(catalogBytes()).releases).toHaveLength(4);
    expect(() => parseAndValidateCatalog(catalogBytes(["1.1.0", "1.1.1"]))).toThrow(/ordered/);
    expect(() => parseAndValidateCatalog(catalogBytes(["1.1.4", "1.1.3", "1.1.2", "1.1.1", "1.1.0"]))).toThrow(/format/);
  });

  it("verifies Ed25519 signatures and rejects changed catalogs", () => {
    const pair = generateKeyPairSync("ed25519");
    const privateKey = pair.privateKey;
    const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
    const bytes = catalogBytes();
    const signature = sign(null, bytes, privateKey);
    expect(verifyCatalogSignature(bytes, signature, publicKey)).toBe(true);
    expect(verifyCatalogSignature(Buffer.concat([bytes, Buffer.from(" ")]), signature, publicKey)).toBe(false);
  });
});
