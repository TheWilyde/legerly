import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type SessionState = {
  openProfiles: string[];
  activeProfileId: string | null;
};

const file = path.join(app.getPath('userData'), 'session.json');

function read(): SessionState {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const s = JSON.parse(raw);
    return {
      openProfiles: Array.isArray(s.openProfiles) ? s.openProfiles : [],
      activeProfileId: typeof s.activeProfileId === 'string' ? s.activeProfileId : null,
    };
  } catch {
    return { openProfiles: [], activeProfileId: null };
  }
}

function write(state: SessionState) {
  try {
    fs.writeFileSync(file, JSON.stringify(state), 'utf8');
  } catch {}
}

export const sessionStore = {
  get(): SessionState {
    return read();
  },
  set(state: SessionState) {
    write(state);
  },
  addOpen(id: string) {
    const s = read();
    if (!s.openProfiles.includes(id)) s.openProfiles.push(id);
    write(s);
  },
  removeOpen(id: string) {
    const s = read();
    s.openProfiles = s.openProfiles.filter((x) => x !== id);
    if (s.activeProfileId === id) s.activeProfileId = s.openProfiles[0] ?? null;
    write(s);
  },
  setActive(id: string | null) {
    const s = read();
    s.activeProfileId = id;
    write(s);
  },
};