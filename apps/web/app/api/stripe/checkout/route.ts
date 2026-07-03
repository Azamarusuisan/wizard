import { createCheckoutSession } from "@craftsite/pipeline";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const session = await createCheckoutSession({
    orderId: body.orderId,
    customerEmail: body.customerEmail,
    successUrl: body.successUrl,
    cancelUrl: body.cancelUrl
  });

  return Response.json({ url: session.url });
}
