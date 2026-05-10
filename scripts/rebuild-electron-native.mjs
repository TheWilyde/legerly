import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const npmExecPathEnv = process.env.npm_execpath;
const npmExecPath = npmExecPathEnv || 'pnpm';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

const env = {
  ...process.env,
  npm_config_runtime: 'electron',
  npm_config_target: electronVersion,
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_update_binary: 'true',
};

process.stdout.write(`\n> Rebuilding native modules for Electron ${electronVersion}\n`);

function tryRebuild(argsLabel, args) {
  process.stdout.write(`\n> ${argsLabel}\n`);
  const res = spawnSync(process.execPath, [npmExecPath, ...args], {
    stdio: 'inherit',
    env,
  });

  if (res.error) {
    process.stderr.write(`Command failed to start: ${String(res.error)}\n`);
    return res;
  }

  return res;
}

let result = tryRebuild('Rebuilding better-sqlite3 and keytar', [
  'rebuild',
  'better-sqlite3',
  'keytar',
]);

if ((result.status ?? 1) !== 0) {
  process.stdout.write('\n> First rebuild failed — retrying build-from-source for better-sqlite3\n');
  result = tryRebuild('Rebuilding better-sqlite3 from source', [
    'rebuild',
    '--build-from-source',
    'better-sqlite3',
  ]);
}

if (result.error) {
  process.stderr.write(`Command failed to start: ${String(result.error)}\n`);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.stderr.write(
    'Native rebuild failed for Electron target. Install Visual Studio Build Tools with C++ workload, then retry.\n',
  );
  process.exit(result.status ?? 1);
}
