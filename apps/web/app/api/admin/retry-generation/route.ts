import { generateSite } from "@craftsite/pipeline";

export async function POST(request: Request) {
  const form = await request.formData();
  const orderId = String(form.get("orderId") ?? "");
  if (!orderId) return Response.json({ error: "orderId is required" }, { status: 400 });
  const result = await generateSite({ orderId });
  return Response.json(result);
}
