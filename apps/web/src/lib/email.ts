import { Resend } from "resend";
import { formatDate } from "./format-date";

/** Build a Resend client — use user's key if provided, else fall back to platform key. */
function getResend(apiKey?: string | null) {
  return new Resend(apiKey ?? process.env.RESEND_API_KEY);
}

/** Default "from" address — overridden by per-user fromEmail if set. */
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "orders@sucrekaker.com";

// ── Order confirmation ────────────────────────────────────────────────────────

export interface OrderConfirmationData {
  customerName:        string | null;
  customerEmail:       string;
  shopifyOrderNumber:  string | null;
  items:               { title: string; quantity: number }[];
  dueDate:             string | null;
  notes:               string | null;
  /** Per-user overrides — if omitted, platform defaults are used */
  fromName?:           string | null;
  fromEmail?:          string | null;
  resendApiKey?:       string | null;
}

export async function sendOrderConfirmation(data: OrderConfirmationData) {
  const greeting = data.customerName ? `Hi ${data.customerName.split(" ")[0]},` : "Hi there,";
  const orderRef = data.shopifyOrderNumber ? ` (${data.shopifyOrderNumber})` : "";
  const dueLine  = data.dueDate ? `<p>Your order is due on <strong>${formatDate(data.dueDate)}</strong>.</p>` : "";
  const noteLine = data.notes  ? `<p><em>${data.notes}</em></p>` : "";

  const itemRows = data.items
    .map((i) => `<tr><td style="padding:4px 8px">${i.title}</td><td style="padding:4px 8px;text-align:right">${i.quantity}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#be185d">Order Confirmed${orderRef}</h2>
      <p>${greeting}</p>
      <p>We've received your order and are getting started. Here's what you ordered:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead>
          <tr style="background:#fdf2f8">
            <th style="padding:6px 8px;text-align:left">Item</th>
            <th style="padding:6px 8px;text-align:right">Qty</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      ${dueLine}
      ${noteLine}
      <p>If you have any questions, just reply to this email.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px">Sucre Kaker</p>
    </div>
  `;

  const from = data.fromEmail ?? DEFAULT_FROM;
  const fromLabel = data.fromName ? `${data.fromName} <${from}>` : from;

  return getResend(data.resendApiKey).emails.send({
    from:    fromLabel,
    to:      data.customerEmail,
    subject: `Order confirmed${orderRef} — ${data.fromName ?? "Sucre Kaker"}`,
    html,
  });
}

// ── Status update ─────────────────────────────────────────────────────────────

export interface StatusUpdateData {
  customerName:       string | null;
  customerEmail:      string;
  shopifyOrderNumber: string | null;
  newStatus:          string;
  fromName?:          string | null;
  fromEmail?:         string | null;
  resendApiKey?:      string | null;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "Your order is now being made",
  completed:   "Your order is ready",
  cancelled:   "Your order has been cancelled",
};

export async function sendStatusUpdate(data: StatusUpdateData) {
  const label    = STATUS_LABELS[data.newStatus];
  if (!label) return; // don't email for planned / pending status changes

  const greeting = data.customerName ? `Hi ${data.customerName.split(" ")[0]},` : "Hi there,";
  const orderRef = data.shopifyOrderNumber ? ` (${data.shopifyOrderNumber})` : "";

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#be185d">Order Update${orderRef}</h2>
      <p>${greeting}</p>
      <p><strong>${label}.</strong></p>
      <p>If you have any questions, just reply to this email.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px">Sucre Kaker</p>
    </div>
  `;

  const from = data.fromEmail ?? DEFAULT_FROM;
  const fromLabel = data.fromName ? `${data.fromName} <${from}>` : from;

  return getResend(data.resendApiKey).emails.send({
    from:    fromLabel,
    to:      data.customerEmail,
    subject: `${label}${orderRef} — ${data.fromName ?? "Sucre Kaker"}`,
    html,
  });
}
