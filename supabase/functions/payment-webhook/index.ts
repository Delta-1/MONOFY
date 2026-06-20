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

    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN")!;
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
      const { data: existing } = await supabaseAdmin
        .from("credit_transactions")
        .select("id")
        .eq("payment_ref", String(paymentId))
        .maybeSingle();

      if (!existing) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("credits")
          .eq("id", userId)
          .single();

        await supabaseAdmin
          .from("profiles")
          .update({ credits: (profile?.credits ?? 0) + credits })
          .eq("id", userId);

        await supabaseAdmin.from("credit_transactions").insert({
          user_id: userId,
          amount: credits,
          reason: "purchase",
          payment_ref: String(paymentId),
        });
      }
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
