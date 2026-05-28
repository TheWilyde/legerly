import {rebuildElectronNativeModules} from './native-abi.mjs';

const status = rebuildElectronNativeModules();
if (status !== 0) {
  process.stderr.write(
    'Native rebuild failed for Electron target. Install Visual Studio Build Tools with C++ workload, then retry.\n',
  );
  process.exit(status);
}
