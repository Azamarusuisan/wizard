import type { OwnerAlert } from "@craftsite/shared";

export async function notifyOwner(alert: OwnerAlert) {
  await Promise.all([sendEmail(alert), sendLine(alert)]);
}

async function sendEmail(alert: OwnerAlert) {
  if (!process.env.RESEND_API_KEY || !process.env.OWNER_EMAIL) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "craftsite <noreply@craftsite.jp>",
      to: process.env.OWNER_EMAIL,
      subject: alert.subject,
      text: alert.message
    })
  });
}

async function sendLine(alert: OwnerAlert) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.OWNER_LINE_USER_ID) return;
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: process.env.OWNER_LINE_USER_ID,
      messages: [{ type: "text", text: `${alert.subject}\n${alert.message}` }]
    })
  });
}
