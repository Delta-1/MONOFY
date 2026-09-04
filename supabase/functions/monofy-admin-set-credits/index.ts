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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: caller } = await admin
      .from("monofy_profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (caller?.role !== "admin") return json({ error: "Acesso negado" }, 403);

    const body = await req.json();
    const targetUserId = String(body?.target_user_id ?? "");
    const newCredits = Math.floor(Number(body?.new_credits));
    if (!targetUserId || !Number.isFinite(newCredits) || newCredits < 0 || newCredits > 1000000) {
      return json({ error: "Parâmetros inválidos" }, 400);
    }

    const { data: updated, error: updateError } = await admin.rpc("monofy_admin_set_credits", {
      p_target_user_id: targetUserId,
      p_new_credits: newCredits,
    });
    if (updateError) throw updateError;
    if (!updated) return json({ error: "Usuário não encontrado" }, 404);
    return json({ success: true });
  } catch (error) {
    return json({ error: (error as Error).message || "Erro ao atualizar créditos" }, 500);
  }
});
