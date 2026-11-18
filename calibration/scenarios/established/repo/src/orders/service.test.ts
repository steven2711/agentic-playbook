import { describe, expect, it } from "vitest";
import { orderTotalCents } from "./service.js";

describe("orderTotalCents", () => {
  it("sums known skus and ignores unknown ones", () => {
    expect(orderTotalCents([{ sku: "a", qty: 2 }, { sku: "zz", qty: 1 }], { a: 150 })).toBe(300);
  });
});
