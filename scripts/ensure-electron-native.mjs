import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  process.stderr.write(
    'Failed to locate npm executable path (npm_execpath).\n',
  );
  process.exit(1);
}

const rootDir = process.cwd();
const require = createRequire(import.meta.url);
const electronBin = require('electron');
const probeFile = path.resolve(rootDir, 'scripts', 'electron-native-probe.cjs');
const probeEnv = {...process.env};
delete probeEnv.ELECTRON_RUN_AS_NODE;

function run(label, command, args, options = {}) {
  process.stdout.write(`\n> ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  });
  return result;
}

function runProbe() {
  return run('Checking Electron native module ABI', electronBin, [probeFile], {
    env: probeEnv,
  });
}

function printResultOutput(result) {
  if (result.error) {
    process.stderr.write(`Probe command failed: ${String(result.error)}\n`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

const probeBefore = runProbe();
printResultOutput(probeBefore);

if ((probeBefore.status ?? 1) === 0) {
  process.stdout.write('Electron native modules are already compatible.\n');
  process.exit(0);
}

process.stdout.write(
  'Electron native modules are not compatible. Rebuilding app dependencies...\n',
);

const rebuild = run(
  'Rebuilding Electron app dependencies',
  process.execPath,
  [npmExecPath, 'run', 'rebuild:sqlite'],
  {stdio: 'inherit'},
);

if ((rebuild.status ?? 1) !== 0) {
  process.stderr.write('Failed to rebuild Electron app dependencies.\n');
  process.exit(rebuild.status ?? 1);
}

const probeAfter = runProbe();
printResultOutput(probeAfter);

if ((probeAfter.status ?? 1) !== 0) {
  process.stdout.write(
    'Native module ABI mismatch remains after rebuild. Refreshing dependencies and retrying...\n',
  );

  const install = run(
    'Installing app dependencies',
    process.execPath,
    [npmExecPath, 'install'],
    {
      stdio: 'inherit',
    },
  );

  if ((install.status ?? 1) !== 0) {
    process.stderr.write('Failed to refresh app dependencies.\n');
    process.exit(install.status ?? 1);
  }

  const rebuildAfterInstall = run(
    'Rebuilding Electron app dependencies after install',
    process.execPath,
    [npmExecPath, 'run', 'rebuild:sqlite'],
    {stdio: 'inherit'},
  );

  if ((rebuildAfterInstall.status ?? 1) !== 0) {
    process.stderr.write(
      'Failed to rebuild Electron app dependencies after install.\n',
    );
    process.exit(rebuildAfterInstall.status ?? 1);
  }

  const probeFinal = runProbe();
  printResultOutput(probeFinal);

  if ((probeFinal.status ?? 1) !== 0) {
    process.stderr.write(
      'Native module ABI mismatch remains after install + rebuild. Run pnpm run rebuild:sqlite manually. If rebuild still fails, install Visual Studio Build Tools with Desktop development with C++ workload.\n',
    );
    process.exit(probeFinal.status ?? 1);
  }
}

process.stdout.write(
  'Electron native module ABI check passed after rebuild.\n',
);
