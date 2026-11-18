import postgres from "postgres";
import type { Journal } from "../ledger/posting.js";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost/ledger");

export async function saveJournal(journal: Journal): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`insert into journals (id, memo) values (${journal.id}, ${journal.memo})`;
    for (const l of journal.lines) {
      await tx`insert into lines (journal_id, account, debit, credit) values (${journal.id}, ${l.account}, ${l.debit.toString()}, ${l.credit.toString()})`;
    }
  });
}
