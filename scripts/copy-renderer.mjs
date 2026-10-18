// Copies the built frontend (mudanzify-frontend/dist) into ./renderer so the
// backend can load it from disk and electron-builder can package it.
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const frontendDir = path.resolve(root, process.env.FRONTEND_DIR ?? '../mudanzify-frontend');
const source = path.join(frontendDir, 'dist');
const target = path.join(root, 'renderer');

if (!existsSync(path.join(source, 'index.html'))) {
  console.error(`[renderer:copy] No build found at ${source}. Run the frontend build first.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`[renderer:copy] ${source} -> ${target}`);
