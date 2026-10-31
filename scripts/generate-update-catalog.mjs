import fs from 'node:fs';
import {createPrivateKey, createPublicKey, sign, verify} from 'node:crypto';

const owner = 'TheWilyde';
const repository = 'legerly';
const version = String(process.env.RELEASE_VERSION ?? '').trim();
const installerPath = String(process.env.RELEASE_INSTALLER_PATH ?? '').trim();
const privateKeyBase64 = String(process.env.CATALOG_SIGNING_PRIVATE_KEY ?? '').trim();
const expectedPublicKey = String(process.env.VITE_LEDGERLY_CATALOG_PUBLIC_KEY ?? '').trim();
const schemaVersion = Number(process.env.RELEASE_SCHEMA_VERSION ?? '4');
const token = String(process.env.GH_TOKEN ?? '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('RELEASE_VERSION must be stable semver.');
if (!fs.existsSync(installerPath)) throw new Error('RELEASE_INSTALLER_PATH does not exist.');
if (!privateKeyBase64 || !expectedPublicKey) throw new Error('Catalog signing keys are required.');
if (!Number.isInteger(schemaVersion) || schemaVersion < 0) throw new Error('Invalid schema version.');
const schemaSource = fs.readFileSync('electron/schema-version.ts', 'utf8');
const sourceSchemaVersion = Number(/CURRENT_DATA_SCHEMA_VERSION\s*=\s*(\d+)/.exec(schemaSource)?.[1]);
if (sourceSchemaVersion !== schemaVersion) throw new Error('Release schema version does not match the application schema constant.');

const privateKey = createPrivateKey({
  key: Buffer.from(privateKeyBase64, 'base64'),
  format: 'der',
  type: 'pkcs8',
});
const actualPublicKey = createPublicKey(privateKey)
  .export({format: 'der', type: 'spki'})
  .toString('base64');
if (actualPublicKey !== expectedPublicKey) throw new Error('Catalog public and private keys do not match.');

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': `Ledgerly-release/${version}`,
  ...(token ? {Authorization: `Bearer ${token}`} : {}),
};

let previousReleases = [];
const latestResponse = await fetch(`https://api.github.com/repos/${owner}/${repository}/releases/latest`, {headers});
if (latestResponse.ok) {
  const latest = await latestResponse.json();
  const catalogAsset = latest.assets?.find((asset) => asset.name === 'version-catalog.json');
  const signatureAsset = latest.assets?.find((asset) => asset.name === 'version-catalog.json.sig');
  if (catalogAsset && signatureAsset) {
    const [response, signatureResponse] = await Promise.all([
      fetch(catalogAsset.browser_download_url, {headers, redirect: 'follow'}),
      fetch(signatureAsset.browser_download_url, {headers, redirect: 'follow'}),
    ]);
    if (!response.ok || !signatureResponse.ok) throw new Error('Could not download the previous signed catalog.');
    const previousBytes = Buffer.from(await response.arrayBuffer());
    const previousSignature = Buffer.from(await signatureResponse.arrayBuffer());
    if (!verify(null, previousBytes, createPublicKey(privateKey), previousSignature)) {
      throw new Error('Previous catalog signature is invalid.');
    }
    const previousCatalog = JSON.parse(previousBytes.toString('utf8'));
    if (previousCatalog.formatVersion !== 1 || !Array.isArray(previousCatalog.releases)) {
      throw new Error('Previous catalog is malformed.');
    }
    previousReleases = previousCatalog.releases.filter((release) => release.version !== version).slice(0, 3);
  }
} else if (latestResponse.status !== 404) {
  throw new Error(`Could not query the latest release: ${latestResponse.status}`);
}

const current = {
  version,
  publishedAt: new Date().toISOString(),
  notesUrl: `https://github.com/${owner}/${repository}/releases/tag/v${version}`,
  feedUrl: `https://github.com/${owner}/${repository}/releases/download/v${version}`,
  installerSize: fs.statSync(installerPath).size,
  architecture: 'x64',
  minReadableSchema: 0,
  maxReadableSchema: schemaVersion,
};
const catalog = {
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  releases: [current, ...previousReleases],
};
const bytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
fs.writeFileSync('version-catalog.json', bytes);
fs.writeFileSync('version-catalog.json.sig', sign(null, bytes, privateKey));
