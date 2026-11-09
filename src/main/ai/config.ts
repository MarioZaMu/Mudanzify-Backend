import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AiStatus } from '../../shared/contract';

/**
 * Used when GEMINI_MODEL is not set in .env. Flash-Lite has the most generous
 * free quota, which is plenty for a 3–6 question interview.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** Key bundled into the installer by `npm run ai:key` (empty when none was set). */
function readBundledKey(): string | null {
  const keyPath = path.join(process.resourcesPath, 'ai.key');
  if (!existsSync(keyPath)) return null;
  try {
    return readFileSync(keyPath, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * The .env key wins (development); the installed app falls back to the key
 * bundled at build time. It never leaves the main process.
 */
export function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : readBundledKey();
}

export function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function getAiStatus(): AiStatus {
  return getApiKey() ? { mode: 'ai', model: getModel() } : { mode: 'demo', model: null };
}
