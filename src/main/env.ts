// Reads SMARTSPECTRA_API_KEY from the environment or <root>/.env. Never logs it.
import * as fs from 'node:fs';
import * as path from 'node:path';

export function loadEnvKey(root: string): string | null {
  if (process.env.SMARTSPECTRA_API_KEY) return process.env.SMARTSPECTRA_API_KEY.trim() || null;
  try {
    const text = fs.readFileSync(path.join(root, '.env'), 'utf8').replace(/^﻿/, '');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*SMARTSPECTRA_API_KEY\s*=\s*(.*)\s*$/);
      if (m) {
        const v = m[1].replace(/^["']|["']$/g, '').trim();
        if (v && v !== 'your_key_here') return v;
      }
    }
  } catch { /* no .env */ }
  return null;
}
