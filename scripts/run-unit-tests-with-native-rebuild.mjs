import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const npmExecPath = process.env.npm_execpath;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = npmExecPath
  ? process.execPath
  : process.platform === 'win32'
    ? 'cmd.exe'
    : 'pnpm';
const args = npmExecPath
  ? [npmExecPath, 'run', 'test:unit:raw']
  : process.platform === 'win32'
    ? ['/d', '/s', '/c', 'pnpm', 'run', 'test:unit:raw']
  : ['run', 'test:unit:raw'];

const result = spawnSync(command, args, {cwd: rootDir, stdio: 'inherit'});
if (result.error) {
  process.stderr.write(`Command failed to start: ${String(result.error)}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
