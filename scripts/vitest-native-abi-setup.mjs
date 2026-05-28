import {
  ensureElectronNativeModules,
  rebuildNodeNativeModules,
} from './native-abi.mjs';

export default function setup() {
  const nodeStatus = rebuildNodeNativeModules();
  if (nodeStatus !== 0) {
    throw new Error(`Failed to rebuild native modules for Node ABI (${nodeStatus})`);
  }

  return () => {
    const electronStatus = ensureElectronNativeModules();
    if (electronStatus !== 0) {
      throw new Error(
        `Failed to restore native modules for Electron ABI (${electronStatus})`,
      );
    }
  };
}
