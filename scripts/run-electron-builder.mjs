import {spawnSync} from 'node:child_process';

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  process.stderr.write(
    'Failed to locate npm executable path (npm_execpath).\n',
  );
  process.exit(1);
}

const env = {...process.env};
const noDeprecationFlag = '--no-deprecation';
const existingNodeOptions = String(env.NODE_OPTIONS ?? '').trim();

if (!existingNodeOptions.includes(noDeprecationFlag)) {
  env.NODE_OPTIONS = existingNodeOptions
    ? `${existingNodeOptions} ${noDeprecationFlag}`
    : noDeprecationFlag;
}

// Forward extra arguments so a platform can be selected explicitly, e.g.
// `pnpm run build:release -- --win --x64`. Without one, electron-builder
// targets the host platform, which is not what cross-building wants.
const builderArgs = process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [npmExecPath, 'exec', 'electron-builder', ...builderArgs],
  {
    stdio: 'inherit',
    env,
  },
);

if (result.error) {
  process.stderr.write(`Command failed to start: ${String(result.error)}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
