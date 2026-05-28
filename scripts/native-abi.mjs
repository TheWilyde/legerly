import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const require = createRequire(import.meta.url);
const npmExecPath = process.env.npm_execpath;

function runPackageManager(args, label, options = {}) {
  process.stdout.write(`\n> ${label}\n`);

  const command = npmExecPath
    ? process.execPath
    : process.platform === 'win32'
      ? 'cmd.exe'
      : 'pnpm';
  const commandArgs = npmExecPath
    ? [npmExecPath, ...args]
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', 'pnpm', ...args]
      : args;
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    process.stderr.write(`Command failed to start: ${String(result.error)}\n`);
  }

  return result;
}

function statusOf(result) {
  return result.status ?? 1;
}

function nodeRebuildEnv() {
  const env = {...process.env};
  delete env.npm_config_runtime;
  delete env.npm_config_target;
  delete env.npm_config_disturl;
  delete env.npm_config_update_binary;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function electronRebuildEnv() {
  const electronVersion = require('electron/package.json').version;
  return {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_update_binary: 'true',
  };
}

function electronProbeEnv() {
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

export function rebuildNodeNativeModules() {
  let result = runPackageManager(
    ['rebuild', 'better-sqlite3'],
    'Rebuilding better-sqlite3 for Node/Vitest ABI',
    {env: nodeRebuildEnv()},
  );

  if (statusOf(result) !== 0) {
    process.stdout.write(
      '\n> Node ABI rebuild failed; retrying build-from-source for better-sqlite3\n',
    );
    result = runPackageManager(
      ['rebuild', '--build-from-source', 'better-sqlite3'],
      'Rebuilding better-sqlite3 from source for Node/Vitest ABI',
      {env: nodeRebuildEnv()},
    );
  }

  return statusOf(result);
}

export function rebuildElectronNativeModules() {
  const electronVersion = require('electron/package.json').version;
  process.stdout.write(
    `\n> Rebuilding native modules for Electron ${electronVersion}\n`,
  );

  let result = runPackageManager(
    [
      'exec',
      'electron-rebuild',
      '-f',
      '-v',
      electronVersion,
      '-w',
      'better-sqlite3,keytar',
    ],
    'Rebuilding better-sqlite3 and keytar for Electron ABI',
  );

  if (statusOf(result) !== 0) {
    process.stdout.write(
      '\n> Electron ABI rebuild failed; retrying build-from-source for better-sqlite3\n',
    );
    result = runPackageManager(
      [
        'exec',
        'electron-rebuild',
        '-f',
        '--build-from-source',
        '-v',
        electronVersion,
        '-w',
        'better-sqlite3,keytar',
      ],
      'Rebuilding better-sqlite3 from source for Electron ABI',
      {env: electronRebuildEnv()},
    );
  }

  return statusOf(result);
}

function runElectronProbe() {
  const electronBin = require('electron');
  const probeFile = path.resolve(rootDir, 'scripts', 'electron-native-probe.cjs');
  return spawnSync(electronBin, [probeFile], {
    cwd: rootDir,
    encoding: 'utf8',
    env: electronProbeEnv(),
  });
}

function printProbeResult(result) {
  if (result.error) {
    process.stderr.write(`Probe command failed: ${String(result.error)}\n`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

export function ensureElectronNativeModules() {
  process.stdout.write('\n> Checking Electron native module ABI\n');
  const probeBefore = runElectronProbe();
  printProbeResult(probeBefore);

  if (statusOf(probeBefore) === 0) {
    process.stdout.write('Electron native modules are already compatible.\n');
    return 0;
  }

  process.stdout.write(
    'Electron native modules are not compatible. Rebuilding app dependencies...\n',
  );

  let rebuildStatus = rebuildElectronNativeModules();
  if (rebuildStatus !== 0) {
    process.stderr.write('Failed to rebuild Electron app dependencies.\n');
    return rebuildStatus;
  }

  process.stdout.write('\n> Rechecking Electron native module ABI\n');
  const probeAfter = runElectronProbe();
  printProbeResult(probeAfter);

  if (statusOf(probeAfter) === 0) {
    process.stdout.write('Electron native module ABI check passed after rebuild.\n');
    return 0;
  }

  process.stdout.write(
    'Native module ABI mismatch remains after rebuild. Refreshing dependencies and retrying...\n',
  );

  const install = runPackageManager(['install'], 'Installing app dependencies');
  if (statusOf(install) !== 0) {
    process.stderr.write('Failed to refresh app dependencies.\n');
    return statusOf(install);
  }

  rebuildStatus = rebuildElectronNativeModules();
  if (rebuildStatus !== 0) {
    process.stderr.write(
      'Failed to rebuild Electron app dependencies after install.\n',
    );
    return rebuildStatus;
  }

  process.stdout.write('\n> Final Electron native module ABI check\n');
  const probeFinal = runElectronProbe();
  printProbeResult(probeFinal);

  if (statusOf(probeFinal) !== 0) {
    process.stderr.write(
      'Native module ABI mismatch remains after install + rebuild. Install Visual Studio Build Tools with Desktop development with C++ workload, then retry.\n',
    );
    return statusOf(probeFinal);
  }

  process.stdout.write('Electron native module ABI check passed after rebuild.\n');
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const command = process.argv[2];

if (isDirectRun) {
  const status =
    command === 'node'
      ? rebuildNodeNativeModules()
      : command === 'electron'
        ? rebuildElectronNativeModules()
        : command === 'ensure-electron'
          ? ensureElectronNativeModules()
          : 1;

  if (!['node', 'electron', 'ensure-electron'].includes(command)) {
    process.stderr.write(
      'Usage: node scripts/native-abi.mjs <node|electron|ensure-electron>\n',
    );
  }

  process.exit(status);
}
