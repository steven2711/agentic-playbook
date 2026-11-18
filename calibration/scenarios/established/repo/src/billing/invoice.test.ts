import { describe, expect, it } from "vitest";
import { invoiceNumber, remainingRefundable } from "./invoice.js";

describe("invoice", () => {
  it("never reports a negative refundable amount", () => {
    expect(remainingRefundable({ id: "i", orderId: "o", capturedCents: 100, refundedCents: 150 })).toBe(0);
  });
  it("pads invoice numbers", () => {
    expect(invoiceNumber(2026, 42)).toBe("INV-2026-000042");
  });
});
