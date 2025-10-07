import {app} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {z} from 'zod';
import log from './logger';

export type WorkspaceDef = {id: string; name: string; file: string};
export type AppConfig = {
  workspaces: WorkspaceDef[];
  idleCloseMs: number;
  backupsDir?: string;
  updates?: {enabled: boolean};
};

const WorkspaceDefSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  file: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+\.(storedb|sqlite|db)$/),
});

const AppConfigSchema = z.object({
  workspaces: z.array(WorkspaceDefSchema),
  idleCloseMs: z.number().int().min(60_000).max(3_600_000),
  backupsDir: z.string().optional(),
  updates: z.object({enabled: z.boolean()}).optional(),
});

function cfgPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

async function readJson<T>(
  p: string
): Promise<{ok: true; data: T} | {ok: false; error: NodeJS.ErrnoException}> {
  try {
    const s = await fs.readFile(p, 'utf8');
    const data = JSON.parse(s) as T;
    return {ok: true, data};
  } catch (error: any) {
    return {ok: false, error};
  }
}

function processConfig(input: unknown): AppConfig {
  const parsed = AppConfigSchema.safeParse(input);
  if (parsed.success) {
    const cfg = parsed.data as AppConfig;
    if (!cfg.updates) cfg.updates = {enabled: true};
    return cfg;
  }
  throw parsed.error;
}

// Use a safe hardcoded default to guarantee at least one workspace exists
const HARDCODED_FALLBACK: AppConfig = {
  workspaces: [{id: 'default', name: 'Default', file: 'default.storedb'}],
  idleCloseMs: 300000,
  updates: {enabled: true},
};

async function loadDefaultConfig(): Promise<AppConfig> {
  const appRoot = app.getAppPath();
  const defaultCfgPath = path.join(appRoot, 'electron', 'config.default.json');
  const res = await readJson<AppConfig>(defaultCfgPath);
  if (res.ok) {
    try {
      const cfg = processConfig(res.data);
      await saveConfig(cfg).catch(() => {});
      return cfg;
    } catch (err) {
      log.error('[config] Default config invalid, using minimal defaults:', err);
    }
  } else {
    log.warn('[config] No default config found, using minimal defaults');
  }

  // Fall back to a safe, non-empty config
  await saveConfig(HARDCODED_FALLBACK).catch(() => {});
  return HARDCODED_FALLBACK;
}

export async function loadConfig(): Promise<AppConfig> {
  const res = await readJson<AppConfig>(cfgPath());
  if (res.ok) {
    try {
      return processConfig(res.data);
    } catch (err) {
      log.error('[config] Invalid user config, falling back to defaults:', err);
      const badPath = cfgPath() + `.corrupted.${Date.now()}`;
      await fs.copyFile(cfgPath(), badPath).catch(() => {});
      return loadDefaultConfig();
    }
  }

  const code = (res.error && (res.error as any).code) as string | undefined;
  if (code && code !== 'ENOENT') {
    log.error('[config] Failed to load config, using defaults:', res.error);
    const badPath = cfgPath() + `.corrupted.${Date.now()}`;
    await fs.copyFile(cfgPath(), badPath).catch(() => {});
  }

  return loadDefaultConfig();
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  const p = cfgPath();
  await fs.mkdir(path.dirname(p), {recursive: true});
  await fs.writeFile(p, JSON.stringify(cfg, null, 2), 'utf8');
}
