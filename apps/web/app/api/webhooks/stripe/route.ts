import { handleStripeWebhook } from "@craftsite/pipeline";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  await handleStripeWebhook(body, signature);
  return Response.json({ ok: true });
}
