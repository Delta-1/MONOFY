// Edição de imagem por IA (Gemini image) — hoje usada pelo "remover fundo" do editor
// de logos (image-editor.js), com cobrança de créditos no servidor.
//
// Contrato esperado pelo front:
//   POST { image (base64 sem prefixo data:), mime, instruction, cost, reason }
//     -> 200 { image (base64), mime }
//        401 { error }                         sessão inválida
//        402 { error: "insufficient_credits" }
//        500 { error }                         falha do provedor (créditos devolvidos)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";

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
  let reason = "ai_image";
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
    const image = String(body?.image ?? "");
    const mime = String(body?.mime ?? "image/png");
    const instruction = String(body?.instruction ?? "");
    const cost = Math.max(0, Math.floor(Number(body?.cost ?? 0)) || 0);
    reason = String(body?.reason ?? "ai_image").slice(0, 80);

    if (!image || !instruction.trim()) {
      return json({ error: "Parâmetros inválidos" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "IA não configurada (GEMINI_API_KEY ausente)" }, 500);
    }

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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inline_data: { mime_type: mime, data: image } },
              { text: instruction },
            ],
          }],
        }),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      const message = data?.error?.message || `Erro da IA (HTTP ${res.status})`;
      throw new Error(res.status === 429 || res.status === 503 ? `overloaded: ${message}` : message);
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
    if (!img) {
      const blocked = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
      throw new Error(blocked ? `A IA não retornou imagem (${blocked}).` : "A IA não retornou imagem.");
    }

    return json({ image: img.inlineData.data, mime: img.inlineData.mimeType || "image/png" });
  } catch (err) {
    if (userId && charged > 0) {
      await supabaseAdmin.rpc("refund_credits", {
        p_user_id: userId,
        p_amount: charged,
        p_reason: `refund_${reason}`,
      });
    }
    return json({ error: (err as Error).message || "Erro ao processar a imagem." }, 500);
  }
});
