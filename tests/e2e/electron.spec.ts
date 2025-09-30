import { test, expect } from '@playwright/test';
import { _electron as electron, ElectronApplication, Page } from 'playwright';

test.describe('Electron app', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    // Requires: npm run build (so dist-electron/main.js exists)
    app = await electron.launch({ args: ['.'] });
    page = await app.firstWindow();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('loads main window', async () => {
    await expect(page).toHaveTitle(/Bartan|Markaz/i);
  });

  test('lists workspaces via preload API', async () => {
    const result = await page.evaluate(async () => {
      return (window as any).api?.workspaces?.list?.();
    });
    expect(Array.isArray(result)).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});