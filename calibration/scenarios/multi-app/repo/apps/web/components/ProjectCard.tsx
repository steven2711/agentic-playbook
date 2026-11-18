import { formatDate, type Project } from "@atlas/shared";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="rounded border p-4">
      <h2 className="font-semibold">{project.name}</h2>
      <p className="text-sm">Updated {formatDate(project.updatedAt)}</p>
    </article>
  );
}
