import { describe, expect, it } from "vitest";
import { post } from "./posting.js";

describe("post", () => {
  it("accepts a balanced posting", () => {
    expect(post("sale", [{ account: "cash", debit: 500n, credit: 0n }, { account: "revenue", debit: 0n, credit: 500n }]).ok).toBe(true);
  });
  it("rejects an unbalanced posting", () => {
    expect(post("bad", [{ account: "cash", debit: 500n, credit: 0n }, { account: "revenue", debit: 0n, credit: 400n }])).toEqual({ ok: false, error: "unbalanced posting" });
  });
  it("rejects negative amounts", () => {
    expect(post("neg", [{ account: "cash", debit: -1n, credit: 0n }, { account: "x", debit: 0n, credit: -1n }]).ok).toBe(false);
  });
  it("rejects an empty posting", () => {
    expect(post("zero", [{ account: "a", debit: 0n, credit: 0n }, { account: "b", debit: 0n, credit: 0n }]).ok).toBe(false);
  });
});
