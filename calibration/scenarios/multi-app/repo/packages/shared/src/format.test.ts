import { expect, it } from "vitest";
import { formatDate } from "./format";

it("formats as yyyy-mm-dd", () => {
  expect(formatDate("2026-01-02T10:00:00Z")).toBe("2026-01-02");
});
