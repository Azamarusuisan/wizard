import { createClient } from "@supabase/supabase-js";

function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function updateOrderStatus(orderId: string, status: string) {
  const db = supabase();
  if (!db) return console.log(JSON.stringify({ orderId, status }));
  const { error } = await db.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId);
  if (error) throw error;
}

export async function updateOrderPayment(input: {
  orderId: string;
  status?: string;
  paymentMethod?: string;
  stripeCheckoutSessionId?: string;
  stripeSubscriptionId?: string;
}) {
  const db = supabase();
  const update = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.paymentMethod ? { payment_method: input.paymentMethod } : {}),
    ...(input.stripeCheckoutSessionId ? { stripe_checkout_session_id: input.stripeCheckoutSessionId } : {}),
    ...(input.stripeSubscriptionId ? { stripe_subscription_id: input.stripeSubscriptionId } : {}),
    updated_at: new Date().toISOString()
  };
  if (!db) return console.log(JSON.stringify({ orderId: input.orderId, ...update }));
  const { error } = await db.from("orders").update(update).eq("id", input.orderId);
  if (error) throw error;
}

export async function recordEvent(input: {
  leadId?: string;
  orderId?: string;
  siteId?: string;
  name: string;
  payload?: unknown;
}) {
  const db = supabase();
  if (!db) return console.log(JSON.stringify(input));
  const { error } = await db.from("events").insert({
    lead_id: input.leadId,
    order_id: input.orderId,
    site_id: input.siteId,
    name: input.name,
    payload: input.payload ?? {}
  });
  if (error) throw error;
}

export async function saveAiArtifact(input: {
  orderId?: string;
  siteId?: string;
  kind: string;
  provider: string;
  prompt?: string;
  output?: unknown;
  error?: string;
}) {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("ai_artifacts").insert({
    order_id: input.orderId,
    site_id: input.siteId,
    kind: input.kind,
    provider: input.provider,
    prompt: input.prompt,
    output: input.output ?? {},
    error: input.error
  });
  if (error) throw error;
}

export async function logGeneration(input: {
  orderId?: string;
  siteId?: string;
  step: string;
  status: string;
  detail?: unknown;
}) {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("generation_logs").insert({
    order_id: input.orderId,
    site_id: input.siteId,
    step: input.step,
    status: input.status,
    detail: input.detail ?? {}
  });
  if (error) throw error;
}
