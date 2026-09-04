import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Pacotes de créditos (preços em BRL, com desconto crescente nos pacotes maiores)
const CREDIT_PACKS: Record<string, { title: string; price: number; credits: number }> = {
  pack_10: { title: "Monofy - 10 créditos", price: 10.0, credits: 10 },
  pack_25: { title: "Monofy - 25 créditos", price: 22.0, credits: 25 },
  pack_60: { title: "Monofy - 60 créditos", price: 45.0, credits: 60 },
  pack_150: { title: "Monofy - 150 créditos", price: 95.0, credits: 150 },
  pack_500: { title: "Monofy - 500 créditos", price: 400.0, credits: 500 },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PERSONAL_MODE = true;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Modo pessoal: o checkout foi desativado sem remover a implementação anterior.
  if (PERSONAL_MODE) {
    return new Response(JSON.stringify({ error: "Pagamentos desativados no modo pessoal" }), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "Pagamento ainda não configurado" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/monofy-payment-webhook`;

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
