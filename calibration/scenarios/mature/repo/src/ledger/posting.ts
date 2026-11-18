export interface Line { account: string; debit: bigint; credit: bigint }
export interface Journal { id: string; memo: string; lines: Line[] }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function post(memo: string, lines: Line[]): Result<Journal> {
  if (lines.some((l) => l.debit < 0n || l.credit < 0n)) return { ok: false, error: "negative amount" };
  const debits = lines.reduce((s, l) => s + l.debit, 0n);
  const credits = lines.reduce((s, l) => s + l.credit, 0n);
  if (debits !== credits) return { ok: false, error: "unbalanced posting" };
  if (debits === 0n) return { ok: false, error: "empty posting" };
  return { ok: true, value: { id: crypto.randomUUID(), memo, lines } };
}
