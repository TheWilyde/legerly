# Releasing Ledgerly

Production releases are built by `.github/workflows/release.yml`; do not upload locally built installers.

1. Create a GitHub environment named `production`.
2. Run `node scripts/generate-catalog-key.mjs` once. Add the generated `CATALOG_SIGNING_PRIVATE_KEY` as an environment secret. Store the private key in a password manager as well; losing it prevents extending the trusted rollback catalog.
3. Add the matching base64 SPKI `CATALOG_SIGNING_PUBLIC_KEY` as an environment variable.
4. Update `package.json`, commit on `main`, create the matching `vX.Y.Z` tag, and push the tag.

Windows installers and executables are intentionally unsigned. Users may therefore see Windows SmartScreen or unknown-publisher warnings. The separately signed version catalog and Electron Builder SHA-512 metadata still protect release selection and downloaded-file integrity.

The workflow fails if the tag differs from the package version, the catalog signing settings are absent, or either Windows executable is unexpectedly Authenticode-signed. Existing installations need one manual installation of `v1.1.0`; releases after that are delivered in-app.
