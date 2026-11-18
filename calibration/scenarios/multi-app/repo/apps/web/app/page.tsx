import { listProjects } from "../lib/api";
import { ProjectCard } from "../components/ProjectCard";

export default async function Dashboard() {
  const projects = await listProjects();
  return (
    <main className="grid gap-4 p-8">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </main>
  );
}
