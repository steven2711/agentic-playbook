import request from "supertest";
import { expect, it } from "vitest";
import { createApp } from "../src/server.js";

it("GET /health", async () => {
  expect((await request(createApp()).get("/health")).body).toEqual({ ok: true });
});
