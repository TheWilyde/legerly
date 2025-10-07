import {app} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {z} from 'zod';
import log from './logger';

export type AppConfig = {
  updates?: {enabled: boolean};
};

const AppConfigSchema = z.object({
  updates: z.object({enabled: z.boolean()}).optional(),
});

function cfgPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function readJson(p: string) {
  try {
    const text = await fs.readFile(p, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function processConfig(input: unknown): AppConfig {
  const parsed = AppConfigSchema.safeParse(input);
  if (!parsed.success) {
    log.warn('[config] Invalid config, using defaults:', parsed.error);
    return {updates: {enabled: true}};
  }
  return parsed.data;
}

const HARDCODED_FALLBACK: AppConfig = {
  updates: {enabled: true},
};

export async function loadConfig(): Promise<AppConfig> {
  const p = cfgPath();
  const json = await readJson(p);
  return json ? processConfig(json) : HARDCODED_FALLBACK;
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  const p = cfgPath();
  await fs.mkdir(path.dirname(p), {recursive: true});
  await fs.writeFile(p, JSON.stringify(cfg, null, 2), 'utf8');
}
