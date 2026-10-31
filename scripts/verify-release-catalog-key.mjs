import fs from 'node:fs';
import {createPublicKey} from 'node:crypto';

const publicKeyBase64 = String(
  process.env.VITE_LEDGERLY_CATALOG_PUBLIC_KEY ?? '',
).trim();
const artifactPaths = process.argv.slice(2);

if (!publicKeyBase64) {
  throw new Error('VITE_LEDGERLY_CATALOG_PUBLIC_KEY is required.');
}
if (artifactPaths.length === 0) {
  throw new Error('At least one release artifact path is required.');
}

// Reject malformed values before searching artifacts. This is the same SPKI
// representation consumed by the updater at runtime.
createPublicKey({
  key: Buffer.from(publicKeyBase64, 'base64'),
  format: 'der',
  type: 'spki',
});

const encodedKey = Buffer.from(publicKeyBase64, 'utf8');
for (const artifactPath of artifactPaths) {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Release artifact does not exist: ${artifactPath}`);
  }
  const artifact = fs.readFileSync(artifactPath);
  if (!artifact.includes(encodedKey)) {
    throw new Error(`Release artifact does not embed the production catalog key: ${artifactPath}`);
  }
}

process.stdout.write(
  `Verified the production catalog key in ${artifactPaths.length} release artifact(s).\n`,
);
