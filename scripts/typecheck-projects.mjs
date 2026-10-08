const globalInputs = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".bun-version",
  ".npmrc",
  "vite.config.ts",
]);
const source = /\.(?:[cm]?[jt]sx?|json)$/;

export function typecheckProjects(files, packages) {
  const selected = new Set();
  const reasons = new Map();
  const select = (name, reason) => {
    selected.add(name);
    reasons.set(name, [...new Set([...(reasons.get(name) ?? []), reason])]);
  };
  const owners = [...packages].sort((a, b) => b.directory.length - a.directory.length);
  for (const file of files) {
    if (globalInputs.has(file) || /^tsconfig[^/]*\.json$/.test(file) || (file.startsWith("scripts/") && source.test(file))) {
      for (const project of packages) select(project.name, `${file} is a shared compiler or tooling input`);
      continue;
    }
    if (!source.test(file)) continue;
    const owner = owners.find((project) => file.startsWith(`${project.directory}/`));
    if (!owner) {
      if (file.endsWith(".json")) {
        for (const project of packages) select(project.name, `${file} is an unclassified configuration input`);
        continue;
      }
      throw new Error(`No typecheck ownership for ${file}`);
    }
    select(owner.name, `${file} belongs to ${owner.name}`);
  }
  let expanded;
  do {
    expanded = false;
    for (const project of packages) {
      if (selected.has(project.name)) continue;
      const dependency = project.dependencies.find((name) => selected.has(name));
      if (dependency) {
        select(project.name, `${project.name} is a consumer of ${dependency}`);
        expanded = true;
      }
    }
  } while (expanded);
  return {
    projects: packages.filter((project) => project.typecheck && selected.has(project.name)).map((project) => project.name).sort(),
    reasons,
  };
}
