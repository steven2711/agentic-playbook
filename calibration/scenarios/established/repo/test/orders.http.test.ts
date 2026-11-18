import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/db.js", () => ({ query: vi.fn(async () => [{ id: "00000000-0000-0000-0000-000000000001" }]) }));

const { createApp } = await import("../src/server.js");

describe("POST /orders", () => {
  it("rejects an order with no lines", async () => {
    const res = await request(createApp()).post("/orders").send({ customerId: "00000000-0000-0000-0000-000000000001", lines: [] });
    expect(res.status).toBe(400);
  });
  it("creates an order", async () => {
    const res = await request(createApp()).post("/orders").send({ customerId: "00000000-0000-0000-0000-000000000001", lines: [{ sku: "a", qty: 1 }] });
    expect(res.status).toBe(201);
  });
});
