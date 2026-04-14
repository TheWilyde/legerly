import {spawnSync} from 'node:child_process';

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  process.stderr.write('Failed to locate npm executable path (npm_execpath).\n');
  process.exit(1);
}

function runNpm(args, label) {
  process.stdout.write(`\n> ${label}\n`);
  const result = spawnSync(process.execPath, [npmExecPath, ...args], {
    stdio: 'inherit',
  });

  if (result.error) {
    process.stderr.write(`Command failed to start: ${String(result.error)}\n`);
    return 1;
  }

  return result.status ?? 1;
}

const rebuildNodeExitCode = runNpm(
  ['rebuild', 'better-sqlite3'],
  'Rebuilding better-sqlite3 for Node unit tests',
);
if (rebuildNodeExitCode !== 0) {
  process.exit(rebuildNodeExitCode);
}

const testExitCode = runNpm(['run', 'test:unit:raw'], 'Running unit tests');

const rebuildElectronExitCode = runNpm(
  ['run', 'rebuild:sqlite'],
  'Restoring better-sqlite3 for Electron runtime',
);
if (rebuildElectronExitCode !== 0) {
  process.exit(rebuildElectronExitCode);
}

process.exit(testExitCode);
