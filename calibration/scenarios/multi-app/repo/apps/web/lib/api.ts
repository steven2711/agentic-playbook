import type { Project } from "@atlas/shared";

const base = process.env.ATLAS_API_URL ?? "http://localhost:8000";

export async function listProjects(): Promise<Project[]> {
  const res = await fetch(`${base}/projects`, { cache: "no-store" });
  if (!res.ok) throw new Error(`api ${res.status}`);
  return res.json();
}
