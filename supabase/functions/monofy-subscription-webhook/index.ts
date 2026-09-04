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
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "Pagamento não configurado" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const topic = url.searchParams.get("topic") || url.searchParams.get("type") || body?.type;
    const id = url.searchParams.get("id") || url.searchParams.get("data.id") || body?.data?.id || body?.id;

    if (!id) {
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mudança de status da assinatura em si (autorizada, pausada, cancelada)
    if (topic === "preapproval" || topic === "subscription_preapproval") {
      const preRes = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });
      const preapproval = await preRes.json();
      if (preRes.ok && preapproval.id) {
        await supabaseAdmin
          .from("monofy_subscriptions")
          .update({ status: preapproval.status, updated_at: new Date().toISOString() })
          .eq("mp_preapproval_id", preapproval.id);
      }
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Cobrança individual da recorrência: credita os créditos do mês
    if (topic === "subscription_authorized_payment" || topic === "authorized_payment") {
      const payRes = await fetch(`https://api.mercadopago.com/authorized_payments/${id}`, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      });
      const payment = await payRes.json();

      if (payRes.ok && payment.status === "approved" && payment.preapproval_id) {
        const paymentRef = `sub_${id}`;
        const { data: sub } = await supabaseAdmin
          .from("monofy_subscriptions")
          .select("user_id, credits_per_cycle")
          .eq("mp_preapproval_id", payment.preapproval_id)
          .maybeSingle();

        if (sub) {
          const { error } = await supabaseAdmin.rpc("monofy_apply_credit_payment", {
            p_user_id: sub.user_id,
            p_amount: sub.credits_per_cycle,
            p_reason: "subscription_renewal",
            p_payment_ref: paymentRef,
          });
          if (error) throw error;

          await supabaseAdmin
            .from("monofy_subscriptions")
            .update({ status: "authorized", updated_at: new Date().toISOString() })
            .eq("mp_preapproval_id", payment.preapproval_id);
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
