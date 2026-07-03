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
