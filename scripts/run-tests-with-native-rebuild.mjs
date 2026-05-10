import {spawnSync} from 'node:child_process';

const npmExecPathEnv = process.env.npm_execpath;
const npmExecPath = npmExecPathEnv || 'pnpm';

function runPm(args, label) {
  process.stdout.write(`\n> ${label}\n`);
  const result = spawnSync(process.execPath, [npmExecPath, ...args], {
    stdio: 'inherit',
  });

  if (result.error) {
    process.stderr.write(`Command failed to start: ${String(result.error)}\n`);
    return {status: 1, error: result.error};
  }

  return {status: result.status ?? 1};
}

let r = runPm(['rebuild', 'better-sqlite3'], 'Rebuilding better-sqlite3 for full test run');
if (r.status !== 0) {
  process.stdout.write('\n> Rebuild failed — retrying build-from-source for better-sqlite3\n');
  r = runPm(['rebuild', '--build-from-source', 'better-sqlite3'], 'Rebuilding better-sqlite3 from source for full tests');
}
if (r.status !== 0) {
  process.exit(r.status);
}

const testExit = runPm(['run', 'test:raw'], 'Running full test suite');

const restore = runPm(['run', 'rebuild:sqlite'], 'Restoring better-sqlite3 for Electron runtime');
if (restore.status !== 0) {
  process.exit(restore.status);
}

process.exit(testExit.status);
