import { ApiError, FunctionCallingConfigMode, GoogleGenAI, type FunctionDeclaration } from '@google/genai';

/** Error codes the renderer can recognize inside the IPC error message. */
export const AI_ERROR = { rateLimit: 'AI_RATE_LIMIT', auth: 'AI_AUTH' } as const;

/** Gives the renderer a code for the two errors the user can fix themselves. */
function explain(error: unknown): Error {
  if (error instanceof ApiError) {
    if (error.status === 429) return new Error(AI_ERROR.rateLimit);
    if (error.status === 400 || error.status === 401 || error.status === 403) {
      if (/api key|API_KEY|permission|unauthenticated/i.test(error.message)) return new Error(AI_ERROR.auth);
    }
  }
  return error instanceof Error ? error : new Error('AI request failed');
}

/** Up to three retries after the first attempt, with these pauses before each. */
const RETRY_DELAYS_MS = [1_000, 3_000, 7_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const REQUEST_TIMEOUT_MS = 45_000;

/** Overload (503), gateway timeout (504), request timeout and dropped connections are worth another try. */
function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 503 || error.status === 504;
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
    const code = (error.cause as { code?: string } | undefined)?.code ?? (error as { code?: string }).code;
    if (code && /^(ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_.*)$/.test(code)) return true;
    return /fetch failed|network|socket hang up|timed? ?out/i.test(error.message);
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retries transient failures with a growing pause; auth, rate-limit and bad requests fail at once. */
async function withRetry<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      if (tries >= MAX_ATTEMPTS || !isTransient(error)) throw error;
      await sleep(RETRY_DELAYS_MS[tries - 1]);
    }
  }
}

export interface FunctionCallRequest {
  system: string;
  /** Plain data for the model; it is sent as JSON. */
  input: unknown;
  functions: FunctionDeclaration[];
  /** The model must call one of these; anything else is rejected. */
  allowed: string[];
}

export interface FunctionCallResult {
  name: string;
  args: Record<string, unknown>;
}

export type FunctionCaller = (request: FunctionCallRequest) => Promise<FunctionCallResult>;

/** One forced function call per request: the model always answers with structured data. */
export function createFunctionCaller(apiKey: string, model: string): FunctionCaller {
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });

  return async ({ system, input, functions, allowed }) => {
    let response;
    try {
      response = await withRetry(() =>
        client.models.generateContent({
          model,
          contents: JSON.stringify(input),
          config: {
            systemInstruction: system,
            tools: [{ functionDeclarations: functions }],
            toolConfig: {
              functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: allowed },
            },
          },
        }),
      );
    } catch (error) {
      throw explain(error);
    }

    const call = response.functionCalls?.[0];
    if (!call?.name || typeof call.args !== 'object' || call.args === null || !allowed.includes(call.name)) {
      throw new Error('The AI did not return a structured answer');
    }
    return { name: call.name, args: call.args as Record<string, unknown> };
  };
}
