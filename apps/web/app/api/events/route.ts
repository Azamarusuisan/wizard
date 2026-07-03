import { recordEvent } from "@craftsite/pipeline";

const allowed = new Set(["qr_view", "phone_tap", "line_tap"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "qr_view";
  if (!allowed.has(name)) return Response.json({ error: "unknown event" }, { status: 400 });
  await recordEvent({
    leadId: url.searchParams.get("leadId") ?? undefined,
    siteId: url.searchParams.get("siteId") ?? undefined,
    orderId: url.searchParams.get("orderId") ?? undefined,
    name,
    payload: { ref: request.headers.get("referer") }
  });
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!allowed.has(body.name)) return Response.json({ error: "unknown event" }, { status: 400 });
  await recordEvent({
    leadId: body.leadId,
    siteId: body.siteId,
    orderId: body.orderId,
    name: body.name,
    payload: body.payload ?? {}
  });
  return Response.json({ ok: true });
}
