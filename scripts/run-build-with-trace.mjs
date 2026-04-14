import {spawnSync} from 'node:child_process';

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  process.stderr.write('Failed to locate npm executable path (npm_execpath).\n');
  process.exit(1);
}

const env = {...process.env};
const traceFlags = '--trace-warnings --trace-deprecation';
const existingNodeOptions = String(env.NODE_OPTIONS ?? '').trim();

env.NODE_OPTIONS = existingNodeOptions
  ? `${existingNodeOptions} ${traceFlags}`
  : traceFlags;

if (process.env.TRACE_CHILD_PROCESS === '1') {
  env.NODE_DEBUG = env.NODE_DEBUG
    ? `${env.NODE_DEBUG},child_process`
    : 'child_process';
}

const result = spawnSync(process.execPath, [npmExecPath, 'run', 'build'], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  process.stderr.write(`Command failed to start: ${String(result.error)}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
