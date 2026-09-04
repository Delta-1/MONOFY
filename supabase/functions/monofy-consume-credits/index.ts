import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json();
    const amount = Math.floor(Number(body?.amount ?? 0));
    const reason = String(body?.reason ?? "usage").slice(0, 80);
    if (amount <= 0 || amount > 1000) return json({ error: "Quantidade inválida" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: consumed, error: consumeError } = await admin.rpc("monofy_consume_credits_generic", {
      p_user_id: data.user.id,
      p_amount: amount,
      p_reason: reason,
    });
    if (consumeError) throw consumeError;
    if (!consumed) return json({ error: "insufficient_credits" }, 402);
    return json({ success: true });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro ao consumir créditos" }, 500);
  }
});
