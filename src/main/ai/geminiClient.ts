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
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 45_000 } });

  return async ({ system, input, functions, allowed }) => {
    let response;
    try {
      response = await client.models.generateContent({
        model,
        contents: JSON.stringify(input),
        config: {
          systemInstruction: system,
          tools: [{ functionDeclarations: functions }],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: allowed },
          },
        },
      });
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
