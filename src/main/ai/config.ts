import type { AiStatus } from '../../shared/contract';

/**
 * Used when GEMINI_MODEL is not set in .env. Flash-Lite has the most generous
 * free quota, which is plenty for a 3–6 question interview.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/** The key is read from .env at runtime and never leaves the main process. */
export function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

export function getModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function getAiStatus(): AiStatus {
  return getApiKey() ? { mode: 'ai', model: getModel() } : { mode: 'demo', model: null };
}
