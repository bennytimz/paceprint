// Local-only persistence. Everything lives in <userData>/paceprint-data. No network, no cloud.
// Stored: session summaries (paces, scores, felt ratings, timestamps, baseline) and settings.
// Optional metric-stream recordings ONLY if the user turned on "save session data". Never video.
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Settings { saveStreams: boolean; reducedMotion: boolean; sound: boolean; randomizeOrder: boolean; consentAcceptedAt?: string }
const DEFAULT_SETTINGS: Settings = { saveStreams: false, reducedMotion: false, sound: false, randomizeOrder: false };

export class Store {
  constructor(readonly dir: string) {}
  private p(...xs: string[]) { return path.join(this.dir, ...xs); }
  private ensure() { fs.mkdirSync(this.p('sessions'), { recursive: true }); }

  settings(): Settings {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(this.p('settings.json'), 'utf8')) }; } catch { return { ...DEFAULT_SETTINGS }; }
  }
  saveSettings(s: Partial<Settings>): Settings {
    this.ensure();
    const next = { ...this.settings(), ...s };
    fs.writeFileSync(this.p('settings.json'), JSON.stringify(next, null, 2));
    return next;
  }

  listSessions(): any[] {
    try {
      return fs.readdirSync(this.p('sessions')).filter((f) => f.endsWith('.json')).sort().reverse()
        .map((f) => JSON.parse(fs.readFileSync(this.p('sessions', f), 'utf8')));
    } catch { return []; }
  }
  saveSession(summary: any): string {
    this.ensure();
    const id = String(summary.id ?? Date.now()).replace(/[^\w-]/g, '');
    fs.writeFileSync(this.p('sessions', `${id}.json`), JSON.stringify({ ...summary, id }, null, 2));
    return id;
  }
  deleteSession(id: string) {
    const safe = String(id).replace(/[^\w-]/g, '');
    if (!safe) return;
    fs.rmSync(this.p('sessions', `${safe}.json`), { force: true });
    fs.rmSync(this.p('recordings', `${safe}.stream.json`), { force: true });
  }
  saveStream(id: string, text: string) {
    fs.mkdirSync(this.p('recordings'), { recursive: true });
    fs.writeFileSync(this.p('recordings', `${String(id).replace(/[^\w-]/g, '')}.stream.json`), text);
  }
  /** Removes every file Paceprint created. */
  deleteAll() { fs.rmSync(this.dir, { recursive: true, force: true }); }
  summary() {
    const count = (d: string) => { try { return fs.readdirSync(this.p(d)).length; } catch { return 0; } };
    return { dir: this.dir, sessions: count('sessions'), recordings: count('recordings'), exists: fs.existsSync(this.dir) };
  }
}
