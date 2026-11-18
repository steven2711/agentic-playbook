import { query } from "../lib/db.js";
import { remainingRefundable, type Invoice } from "./invoice.js";

/** Issues a refund through the payments provider. Must never exceed the captured amount. */
export async function issueRefund(invoiceId: string, amountCents: number) {
  const rows = await query<Invoice>("select * from invoices where id = $1 for update", [invoiceId]);
  const invoice = rows[0];
  if (!invoice) throw new Error("invoice not found");
  if (amountCents > remainingRefundable(invoice)) throw new Error("refund exceeds captured amount");
  const res = await fetch("https://payments.example.invalid/refunds", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.PAYMENTS_API_KEY}` },
    body: JSON.stringify({ invoiceId, amountCents }),
  });
  if (!res.ok) throw new Error(`payments provider refused refund: ${res.status}`);
  await query("update invoices set refunded_cents = refunded_cents + $1 where id = $2", [amountCents, invoiceId]);
  return { invoiceId, amountCents };
}
