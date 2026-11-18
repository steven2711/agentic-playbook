import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProjectCard } from "./ProjectCard";

it("shows the project name", () => {
  render(<ProjectCard project={{ id: "1", name: "Apollo", updatedAt: "2026-01-02T00:00:00Z" }} />);
  expect(screen.getByText("Apollo")).toBeTruthy();
});
