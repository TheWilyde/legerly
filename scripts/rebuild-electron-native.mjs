import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  process.stderr.write(
    'Failed to locate package manager executable path (npm_execpath).\n',
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

const env = {
  ...process.env,
  npm_config_runtime: 'electron',
  npm_config_target: electronVersion,
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_update_binary: 'true',
};

process.stdout.write(
  `\n> Rebuilding native modules for Electron ${electronVersion}\n`,
);

const result = spawnSync(
  process.execPath,
  [npmExecPath, 'rebuild', 'better-sqlite3', 'keytar'],
  {
    stdio: 'inherit',
    env,
  },
);

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
