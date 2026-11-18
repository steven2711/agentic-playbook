import { expect, it } from "vitest";
import { post } from "../../src/ledger/posting.js";

it("rejects unbalanced postings", () => {
  expect(post("x", [{ account: "a", debit: 2n, credit: 0n }, { account: "b", debit: 0n, credit: 1n }]).ok).toBe(false);
});
