import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { typecheckProjects } from "./typecheck-projects.mjs";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
const paths = (text) => text.split("\0").filter(Boolean);

try {
  const base = git("merge-base", "HEAD", process.env.TYPECHECK_BASE ?? "origin/main");
  const files = [...new Set([
    ...paths(git("diff", "--name-only", "-z", "--diff-filter=ACMRD", `${base}...HEAD`)),
    ...paths(git("diff", "--name-only", "-z", "--diff-filter=ACMRD", "HEAD")),
    ...paths(git("ls-files", "--others", "--exclude-standard", "-z")),
  ])];
  const workspace = JSON.parse(execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], { cwd: repoRoot, encoding: "utf8" }));
  const packages = workspace.filter((project) => project.path !== repoRoot).map((project) => {
    const manifest = JSON.parse(readFileSync(resolve(project.path, "package.json"), "utf8"));
    return {
      name: manifest.name,
      directory: relative(repoRoot, project.path).replaceAll("\\", "/"),
      typecheck: Boolean(manifest.scripts?.typecheck),
      dependencies: Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }),
    };
  });
  const plan = typecheckProjects(files, packages);
  console.log("Changed files:");
  for (const file of files) console.log(`- ${file}`);
  console.log("Typecheck projects:");
  for (const name of plan.projects) console.log(`- ${name}: ${plan.reasons.get(name).join("; ")}`);
  if (!plan.projects.length) console.log("No TypeScript projects affected.");
  if (!process.argv.includes("--plan") && plan.projects.length) {
    const filters = plan.projects.flatMap((name) => ["--filter", name]);
    const result = spawnSync("pnpm", [...filters, "--workspace-concurrency=1", "run", "typecheck"], { cwd: repoRoot, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
