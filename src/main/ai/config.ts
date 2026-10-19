import type { AiStatus } from '../../shared/contract';

/** Used when ANTHROPIC_MODEL is not set in .env. */
const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** The key is read from .env at runtime and never leaves the main process. */
export function getApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? key : null;
}

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export function getAiStatus(): AiStatus {
  return getApiKey() ? { mode: 'ai', model: getModel() } : { mode: 'demo', model: null };
}
