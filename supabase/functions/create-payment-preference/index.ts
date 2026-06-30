import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Pacotes de créditos (preços em BRL, 1 crédito = R$1, com desconto no pacote de 100)
const CREDIT_PACKS: Record<string, { title: string; price: number; credits: number }> = {
  pack_10: { title: "Monofy - 10 créditos", price: 10.0, credits: 10 },
  pack_20: { title: "Monofy - 20 créditos", price: 20.0, credits: 20 },
  pack_50: { title: "Monofy - 50 créditos", price: 50.0, credits: 50 },
  pack_100: { title: "Monofy - 100 créditos", price: 90.0, credits: 100 },
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

    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN")!;
    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`;

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: pack.title,
            quantity: 1,
            unit_price: pack.price,
            currency_id: "BRL",
          },
        ],
        payer: {
          email: user.email ?? undefined,
        },
        metadata: { user_id: user.id, credits: pack.credits },
        external_reference: `${user.id}:${pack.credits}`,
        back_urls: { success: successUrl, failure: cancelUrl, pending: cancelUrl },
        auto_return: "approved",
        notification_url: notificationUrl,
      }),
    });

    const preference = await mpRes.json();
    if (!mpRes.ok) {
      return new Response(JSON.stringify({ error: preference }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: preference.init_point }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
