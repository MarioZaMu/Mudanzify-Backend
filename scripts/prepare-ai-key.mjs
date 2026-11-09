// Writes build/ai.key from GEMINI_API_KEY (.env or environment) so electron-builder
// can ship it as a resource. The file is git-ignored and the key is never printed.
// Without a key the file is empty and the installed app runs in demo mode.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const key = process.env.GEMINI_API_KEY?.trim() ?? '';
const target = path.join(root, 'build', 'ai.key');

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, key, 'utf8');
console.log(
  key
    ? '[ai:key] Key found: the installer will include it. Share that installer privately.'
    : '[ai:key] No GEMINI_API_KEY: the installer will run in demo mode.',
);
