import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/db.js", () => ({
  query: vi.fn(async () => [{ id: "i", orderId: "o", capturedCents: 1000, refundedCents: 900 }]),
}));

const { issueRefund } = await import("../../src/billing/refund.js");

describe("refund-cap (hidden evaluator)", () => {
  it("refuses a refund above the remaining captured amount", async () => {
    await expect(issueRefund("i", 200)).rejects.toThrow();
  });
});
