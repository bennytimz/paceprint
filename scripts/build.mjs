// Bundles main, preload, renderer and scripts with esbuild. Copies static renderer files.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'warning', target: 'es2022' };
const nodeExternal = ['electron', '@smartspectra/node-sdk', '@smartspectra/node-sdk/*'];

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', platform: 'node', format: 'cjs', external: nodeExternal }),
  // sandboxed preload: may only require('electron'), so the SDK preload is bundled in.
  build({ ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.js', platform: 'node', format: 'cjs', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js', platform: 'browser', format: 'iife', loader: { '.md': 'text' } }),
  build({ ...common, entryPoints: ['scripts/verify-sdk.ts'], outfile: 'dist/scripts/verify-sdk.js', platform: 'node', format: 'cjs', external: nodeExternal }),
]);
mkdirSync('dist/renderer', { recursive: true });
cpSync('src/renderer/static', 'dist/renderer', { recursive: true });
cpSync('tests/fixtures', 'dist/fixtures', { recursive: true });
