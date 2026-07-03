export async function deliverPreview(input: {
  customerEmail?: string;
  customerLineUserId?: string;
  businessName: string;
  previewUrl: string;
  screenshots?: string[];
}) {
  const text = [
    `${input.businessName} 様`,
    "",
    "ホームページの見本ができました。",
    "下のURLからご確認ください。",
    input.previewUrl,
    "",
    "直したいところがあれば、このまま文章でお知らせください。"
  ].join("\n");

  await Promise.all([
    input.customerEmail ? sendPreviewEmail(input.customerEmail, text) : undefined,
    input.customerLineUserId ? sendPreviewLine(input.customerLineUserId, text) : undefined
  ]);
}

async function sendPreviewEmail(to: string, text: string) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "craftsite <noreply@craftsite.jp>",
      to,
      subject: "ホームページの見本ができました",
      text
    })
  });
}

async function sendPreviewLine(to: string, text: string) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) return;
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }]
    })
  });
}
