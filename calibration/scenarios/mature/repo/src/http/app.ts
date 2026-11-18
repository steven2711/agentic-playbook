import { Hono } from "hono";
import * as v from "valibot";
import { post } from "../ledger/posting.js";
import { saveJournal } from "../store/journals.js";

export const app = new Hono();

const Line = v.object({ account: v.string(), debit: v.optional(v.string()), credit: v.optional(v.string()) });
const Posting = v.object({ memo: v.string(), lines: v.pipe(v.array(Line), v.minLength(2)) });

app.post("/journals", async (c) => {
  const body = v.safeParse(Posting, await c.req.json());
  if (!body.success) return c.json({ error: "invalid posting" }, 400);
  const journal = post(body.output.memo, body.output.lines.map((l) => ({ account: l.account, debit: BigInt(l.debit ?? 0), credit: BigInt(l.credit ?? 0) })));
  if (!journal.ok) return c.json({ error: journal.error }, 422);
  await saveJournal(journal.value);
  return c.json({ id: journal.value.id }, 201);
});
