import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Thin proxy to Gemini for the in-page agent panel.
 * The client keeps the full conversation (`contents`) in Gemini's native format and
 * sends the current WebMCP tool declarations with every turn. The model's reply is
 * returned verbatim so function calls (and thought signatures) round-trip intact.
 *
 * Free-tier keys hit per-minute quotas quickly, so we fall through a chain of models
 * on 429 / 5xx / timeout. When switching models mid-conversation the previous model's
 * thought signatures are replaced with Gemini's documented skip-validation sentinel.
 */
const FALLBACKS = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
const SKIP_SIG = "skip_thought_signature_validator";

type Part = Record<string, unknown> & { thoughtSignature?: string };
type Content = { role: string; parts: Part[] };

function stripSignatures(contents: Content[]): Content[] {
  return contents.map((c) => ({
    ...c,
    parts: c.parts.map((p) => (p.thoughtSignature ? { ...p, thoughtSignature: SKIP_SIG } : p)),
  }));
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
  }
  const preferred = process.env.GEMINI_MODEL || FALLBACKS[0];
  const chain = [preferred, ...FALLBACKS.filter((m) => m !== preferred)];
  const body = (await req.json()) as {
    contents: Content[];
    tools: { name: string; description: string; parametersJsonSchema: unknown }[];
    system: string;
    model?: string;
  };

  const errors: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    // Signatures are only valid for the model that produced them; sanitize when we've moved on.
    const contents = i === 0 && (!body.model || body.model === model) ? body.contents : stripSignatures(body.contents);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: body.system }] },
          contents,
          tools: body.tools.length ? [{ functionDeclarations: body.tools }] : undefined,
          generationConfig: { temperature: 0.3 },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push(`${model}: ${res.status} ${text.slice(0, 200)}`);
        if (res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 400) continue;
        return NextResponse.json({ error: `Gemini error ${res.status}: ${text.slice(0, 400)}` }, { status: 502 });
      }
      const data = (await res.json()) as { candidates?: { content?: Content }[] };
      const content = data.candidates?.[0]?.content;
      if (!content) {
        errors.push(`${model}: empty candidate`);
        continue;
      }
      return NextResponse.json({ content, model });
    } catch (err) {
      errors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return NextResponse.json({ error: `All models failed. ${errors.join(" | ").slice(0, 600)}` }, { status: 502 });
}
