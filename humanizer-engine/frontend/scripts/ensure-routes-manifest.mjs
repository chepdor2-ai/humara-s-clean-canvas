import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourceManifest = resolve('.next/routes-manifest.json');
const deterministicManifest = resolve('.next/routes-manifest-deterministic.json');

if (!existsSync(sourceManifest)) {
  console.warn('[vercel-postbuild] routes-manifest.json not found; skipping deterministic manifest copy.');
  process.exit(0);
}

if (!existsSync(deterministicManifest)) {
  mkdirSync(dirname(deterministicManifest), { recursive: true });
  copyFileSync(sourceManifest, deterministicManifest);
  console.log('[vercel-postbuild] created .next/routes-manifest-deterministic.json');
}