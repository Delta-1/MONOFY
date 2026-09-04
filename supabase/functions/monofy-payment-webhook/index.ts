import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    // Mercado Pago manda o id do pagamento via query string (?data.id=) ou no corpo
    const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || body?.data?.id;
    const topic = url.searchParams.get("topic") || url.searchParams.get("type") || body?.type;

    if (!paymentId || (topic && topic !== "payment")) {
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "Pagamento não configurado" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });
    const payment = await paymentRes.json();

    if (!paymentRes.ok || payment.status !== "approved") {
      return new Response(JSON.stringify({ received: true, status: payment.status }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = payment.metadata?.user_id;
    const credits = parseInt(payment.metadata?.credits ?? "0", 10);

    if (userId && credits > 0) {
      const { error } = await supabaseAdmin.rpc("monofy_apply_credit_payment", {
        p_user_id: userId,
        p_amount: credits,
        p_reason: "purchase",
        p_payment_ref: String(paymentId),
      });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
