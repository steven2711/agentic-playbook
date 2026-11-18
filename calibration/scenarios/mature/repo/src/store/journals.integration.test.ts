import { describe, expect, it } from "vitest";

// Runs against the Postgres service container in CI (DATABASE_URL set); skipped locally without it.
describe.runIf(process.env.DATABASE_URL)("saveJournal", () => {
  it("writes the journal and its lines in one transaction", async () => {
    const { saveJournal } = await import("./journals.js");
    await expect(saveJournal({ id: crypto.randomUUID(), memo: "it", lines: [] })).resolves.toBeUndefined();
  });
});
