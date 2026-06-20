import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature) {
    return new Response("Assinatura ausente", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Webhook inválido: ${err}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const credits = parseInt(session.metadata?.credits ?? "0", 10);

    if (userId && credits > 0) {
      // idempotência: não credita duas vezes a mesma sessão
      const { data: existing } = await supabaseAdmin
        .from("credit_transactions")
        .select("id")
        .eq("stripe_session_id", session.id)
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
          stripe_session_id: session.id,
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
