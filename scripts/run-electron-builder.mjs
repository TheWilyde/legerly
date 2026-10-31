import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const builderCli = fileURLToPath(
  new URL('../node_modules/electron-builder/cli.js', import.meta.url),
);

const env = {...process.env};
const noDeprecationFlag = '--no-deprecation';
const existingNodeOptions = String(env.NODE_OPTIONS ?? '').trim();

if (!existingNodeOptions.includes(noDeprecationFlag)) {
  env.NODE_OPTIONS = existingNodeOptions
    ? `${existingNodeOptions} ${noDeprecationFlag}`
    : noDeprecationFlag;
}

const result = spawnSync(
  process.execPath,
  [builderCli, ...process.argv.slice(2)],
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
