import { query } from "../lib/db.js";

export interface OrderLine { sku: string; qty: number }

export async function createOrder(input: { customerId: string; lines: OrderLine[] }) {
  const rows = await query<{ id: string }>("insert into orders (customer_id, lines) values ($1, $2) returning id", [input.customerId, JSON.stringify(input.lines)]);
  return { id: rows[0]?.id, ...input };
}

export async function getOrder(id: string) {
  const rows = await query("select * from orders where id = $1", [id]);
  return rows[0] ?? null;
}

export function orderTotalCents(lines: OrderLine[], prices: Record<string, number>): number {
  return lines.reduce((sum, l) => sum + (prices[l.sku] ?? 0) * l.qty, 0);
}
