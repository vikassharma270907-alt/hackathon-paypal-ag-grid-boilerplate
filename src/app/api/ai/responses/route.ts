import { aiModels, openAiKey } from '@/lib/ai';
import { denyUnlessAuthorized, rejectOversizedBody } from '@/lib/api-guard';

// Proxy for AG Studio's OpenAI adapter (app/dashboard/studio/openai-adapter.ts). The adapter
// runs in the browser and POSTs to `${endpoint}/responses`; with its endpoint set to /api/ai it lands
// here. This adds the server's OpenAI key (see lib/ai.ts), forwards the body to the OpenAI Responses API and
// streams the SSE reply straight back, so the adapter works unchanged and the key never leaves the
// server.

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// Bounds the cost of a single turn, whatever the client asks for. Reasoning tokens count towards it.
const MAX_OUTPUT_TOKENS = 32_000;

const error = (status: number, message: string) => Response.json({ error: { message } }, { status });

export async function POST(request: Request) {
  const apiKey = openAiKey();
  if (!apiKey) return error(503, 'The AI assistant is not configured: set AG_STUDIO_OPENAI_API_KEY in .env.local.');

  const denied = denyUnlessAuthorized(request);
  if (denied) return denied;
  const tooLarge = rejectOversizedBody(request, 65_536);
  if (tooLarge) return tooLarge;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
  } catch {
    return error(400, 'Request body must be a JSON object.');
  }

  // Only the models offered in the picker (OPENAI_MODELS) may be called.
  const models = aiModels();
  const model = typeof body.model === 'string' && body.model ? body.model : models[0];
  if (!models.includes(model)) return error(400, `Model "${model}" is not enabled.`);

  // Forward only the fields the chat UI needs. Tools, stores, and other billable/privileged
  // Responses API options are never passed through from an untrusted caller.
  const allowed = [
    'input', 'instructions', 'stream', 'temperature', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls',
  ] as const;
  const forwarded: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) forwarded[key] = body[key];
  }
  // Only client-executed function tools are accepted. Built-in OpenAI tools (web search, code
  // interpreter, MCP, ...) run on the provider side with the owner's key and are refused.
  if (Array.isArray(body.tools)) {
    const functionTools = body.tools.filter(
      (t: unknown) => typeof t === 'object' && t !== null && (t as { type?: unknown }).type === 'function'
    );
    if (functionTools.length !== body.tools.length) return error(400, 'Only function tools are allowed.');
    forwarded.tools = functionTools;
  }

  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...forwarded, model, store: false, max_output_tokens: MAX_OUTPUT_TOKENS }),
      // Stopping the chat in Studio aborts the browser request, which cancels this one too.
      signal: request.signal,
    });
  } catch {
    return error(502, 'The AI provider is unreachable.');
  }

  // Errors come back as JSON and the adapter reads `error.message` from them; success is an SSE stream.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
