import { describe, expect, it, vi } from "vitest";

vi.mock("../store/journals.js", () => ({ saveJournal: vi.fn(async () => {}) }));
const { app } = await import("./app.js");

describe("POST /journals", () => {
  it("rejects an unbalanced posting with 422", async () => {
    const res = await app.request("/journals", { method: "POST", body: JSON.stringify({ memo: "x", lines: [{ account: "a", debit: "5" }, { account: "b", credit: "4" }] }) });
    expect(res.status).toBe(422);
  });
  it("stores a balanced posting", async () => {
    const res = await app.request("/journals", { method: "POST", body: JSON.stringify({ memo: "x", lines: [{ account: "a", debit: "5" }, { account: "b", credit: "5" }] }) });
    expect(res.status).toBe(201);
  });
});
