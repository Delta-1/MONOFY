import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Mapeia pacotes de créditos para os Price IDs criados no Stripe
const CREDIT_PACKS: Record<string, { priceId: string; credits: number }> = {
  pack_10: { priceId: "price_1TkSAMC9cy5307IIpWuMCliO", credits: 10 },
  pack_30: { priceId: "price_1TkSANC9cy5307IIwvs9N27t", credits: 30 },
  pack_100: { priceId: "price_1TkSAOC9cy5307IIHj6TwpJR", credits: 100 },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const { packId, successUrl, cancelUrl } = await req.json();
    const pack = CREDIT_PACKS[packId];
    if (!pack) {
      return new Response(JSON.stringify({ error: "Pacote inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("line_items[0][price]", pack.priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("customer_email", user.email ?? "");
    params.set("metadata[user_id]", user.id);
    params.set("metadata[credits]", String(pack.credits));

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: session }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
