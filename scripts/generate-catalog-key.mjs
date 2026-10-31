import {generateKeyPairSync} from 'node:crypto';

const {privateKey, publicKey} = generateKeyPairSync('ed25519');
process.stdout.write(
  [
    'GitHub production secret CATALOG_SIGNING_PRIVATE_KEY:',
    privateKey.export({format: 'der', type: 'pkcs8'}).toString('base64'),
    '',
    'GitHub production variable CATALOG_SIGNING_PUBLIC_KEY:',
    publicKey.export({format: 'der', type: 'spki'}).toString('base64'),
    '',
  ].join('\n'),
);
