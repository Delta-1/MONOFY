// Geração de texto por IA (Gemini) com cobrança de créditos no servidor.
//
// Recriada depois que o projeto Supabase original foi perdido: o contrato aqui é
// exatamente o que o front-end já esperava em callAI() (index.html):
//   POST { prompt, cost, reason }  ->  200 { text }
//                                      401 { error }  sessão inválida
//                                      402 { error: "insufficient_credits" }
//                                      500 { error }  falha do provedor (créditos devolvidos)
// A chave do provedor fica só no servidor; o débito acontece ANTES de gerar (atômico,
// via consume_credits_generic) e é estornado se a geração falhar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEXT_MODEL = Deno.env.get("GEMINI_TEXT_MODEL") ?? "gemini-2.5-flash";
// Grounding com busca do Google: usado nas seções da monografia (marco teórico e
// afins) para o texto sair com dados reais em vez de inventados.
const GROUNDED_REASONS = /^(ai_section_|lab_analyze_norm$|ai_chat_assistant$)/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let userId: string | null = null;
  let charged = 0;
  let reason = "ai_generate";
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "Não autenticado" }, 401);
    }
    userId = userData.user.id;

    const body = await req.json();
    const prompt = String(body?.prompt ?? "");
    const cost = Math.max(0, Math.floor(Number(body?.cost ?? 0)) || 0);
    reason = String(body?.reason ?? "ai_generate").slice(0, 80);

    if (!prompt.trim()) {
      return json({ error: "Prompt vazio" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "IA não configurada (GEMINI_API_KEY ausente)" }, 500);
    }

    // cost 0 é usado pelo autocomplete/sugestão: gera sem cobrar.
    if (cost > 0) {
      const { data: ok, error: rpcError } = await supabaseAdmin.rpc("consume_credits_generic", {
        p_user_id: userId,
        p_amount: cost,
        p_reason: reason,
      });
      if (rpcError) return json({ error: "Erro ao debitar créditos" }, 500);
      if (!ok) return json({ error: "insufficient_credits" }, 402);
      charged = cost;
    }

    const payload: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
    };
    if (GROUNDED_REASONS.test(reason)) {
      payload.tools = [{ google_search: {} }];
    }

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
      // 429/503 do Gemini: o front reconhece "overloaded/high demand" e tenta de novo.
      const message = data?.error?.message || `Erro da IA (HTTP ${res.status})`;
      throw new Error(res.status === 429 || res.status === 503 ? `overloaded: ${message}` : message);
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p?.text ?? "").join("").trim();
    if (!text) {
      const blocked = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
      throw new Error(blocked ? `A IA não retornou texto (${blocked}).` : "A IA não retornou texto.");
    }

    return json({ text });
  } catch (err) {
    if (userId && charged > 0) {
      await supabaseAdmin.rpc("refund_credits", {
        p_user_id: userId,
        p_amount: charged,
        p_reason: `refund_${reason}`,
      });
    }
    return json({ error: (err as Error).message || "Erro ao contactar a IA." }, 500);
  }
});
