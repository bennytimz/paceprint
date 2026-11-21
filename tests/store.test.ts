import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Store } from '../src/main/store';

describe('local store', () => {
  let dir: string;
  let store: Store;
  beforeEach(() => {
    dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paceprint-test-')), 'paceprint-data');
    store = new Store(dir);
  });

  it('defaults: session-data recording is off', () => {
    expect(store.settings().saveStreams).toBe(false);
  });

  it('saves, lists and deletes one session (and its stream)', () => {
    store.saveSession({ id: 'a1', createdAt: '2026-11-21T10:00:00Z', bestPace: 5.5 });
    store.saveSession({ id: 'b2', createdAt: '2026-11-21T11:00:00Z', bestPace: 6.0 });
    store.saveStream('a1', '{"format":"paceprint-stream"}');
    expect(store.listSessions().map((s) => s.id)).toEqual(['b2', 'a1']);
    store.deleteSession('a1');
    expect(store.listSessions().map((s) => s.id)).toEqual(['b2']);
    expect(fs.existsSync(path.join(dir, 'recordings', 'a1.stream.json'))).toBe(false);
  });

  it('rejects path tricks in ids', () => {
    store.saveSession({ id: '../../evil', createdAt: 'x' });
    expect(fs.readdirSync(path.join(dir, 'sessions'))).toEqual(['evil.json']);
    store.deleteSession('../../../somewhere');
    expect(fs.existsSync(path.dirname(dir))).toBe(true);
  });

  it('delete everything removes every file Paceprint created', () => {
    store.saveSettings({ saveStreams: true });
    store.saveSession({ id: 'c3', createdAt: 'x' });
    store.saveStream('c3', '{}');
    expect(store.summary()).toMatchObject({ sessions: 1, recordings: 1, exists: true });
    store.deleteAll();
    expect(fs.existsSync(dir)).toBe(false);
    expect(store.summary()).toMatchObject({ sessions: 0, recordings: 0, exists: false });
    expect(store.settings().saveStreams).toBe(false);
  });
});
