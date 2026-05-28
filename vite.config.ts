import {defineConfig} from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ReactCompilerConfig = {
  target: '19',
  panicThreshold: 'none',
} as const;

function chunkByPackage(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/');
  if (!normalizedId.includes('/node_modules/')) return undefined;

  if (
    normalizedId.includes('/node_modules/react/') ||
    normalizedId.includes('/node_modules/react-dom/') ||
    normalizedId.includes('/node_modules/scheduler/') ||
    normalizedId.includes('/node_modules/loose-envify/')
  ) {
    return 'vendor-react';
  }

  if (
    normalizedId.includes('/node_modules/recharts/') ||
    normalizedId.includes('/node_modules/victory-vendor/') ||
    normalizedId.includes('/node_modules/d3-')
  ) {
    return 'vendor-charts';
  }

  if (normalizedId.includes('/node_modules/zod/')) {
    return 'vendor-forms';
  }

  if (normalizedId.includes('/node_modules/react-icons/')) {
    return 'vendor-icons';
  }

  if (
    normalizedId.includes('/node_modules/zustand/') ||
    normalizedId.includes('/node_modules/immer/')
  ) {
    return 'vendor-state';
  }

  if (normalizedId.includes('/node_modules/papaparse/')) {
    return 'vendor-data';
  }

  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
      },
    }),
    tailwindcss(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // ✅ Remove @journeyapps/sqlcipher, keep better-sqlite3 external
              external: ['better-sqlite3', 'bindings', 'keytar'],
            },
          },
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: chunkByPackage,
      },
    },
  },
});
