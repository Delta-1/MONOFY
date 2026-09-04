import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const TEXT_MODEL = Deno.env.get("GEMINI_TEXT_MODEL") ?? "gemini-2.5-flash";
const GROUNDED_REASONS = /^(ai_section_|lab_analyze_norm$|ai_chat_assistant$)/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const prompt = String(body?.prompt ?? "");
    const apiKey = String(body?.apiKey ?? "").trim();
    const reason = String(body?.reason ?? "ai_generate").slice(0, 80);
    if (!prompt.trim()) return json({ error: "Prompt vazio" }, 400);
    if (prompt.length > 250000) return json({ error: "Conteúdo muito extenso" }, 413);
    if (!apiKey) return json({ error: "Chave do Gemini não informada" }, 400);

    const payload: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
    };
    if (GROUNDED_REASONS.test(reason)) payload.tools = [{ google_search: {} }];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      const message = data?.error?.message || `Erro da IA (HTTP ${res.status})`;
      throw new Error(res.status === 429 || res.status === 503 ? `overloaded: ${message}` : message);
    }
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part: { text?: string }) => part?.text ?? "").join("").trim();
    if (!text) throw new Error("A IA não retornou texto.");
    return json({ text });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro ao contactar a IA." }, 500);
  }
});
