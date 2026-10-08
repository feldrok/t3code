import assert from "node:assert/strict";
import { test } from "node:test";
import { typecheckProjects } from "./typecheck-projects.mjs";

const packages = [
  { name: "web", directory: "apps/web", typecheck: true, dependencies: ["contracts", "config"] },
  { name: "server", directory: "apps/server", typecheck: true, dependencies: ["contracts", "config"] },
  { name: "contracts", directory: "packages/contracts", typecheck: true, dependencies: ["config"] },
  { name: "config", directory: "packages/config", typecheck: false, dependencies: [] },
];
const selected = (files) => typecheckProjects(files, packages).projects;

test("selects an owning project", () => {
  assert.deepEqual(selected(["apps/web/src/page.tsx"]), ["web"]);
});
test("selects shared types and every consumer", () => {
  assert.deepEqual(selected(["packages/contracts/src/event.ts"]), ["contracts", "server", "web"]);
});
test("propagates configuration packages without their own check", () => {
  assert.deepEqual(selected(["packages/config/tsconfig.json"]), ["contracts", "server", "web"]);
});
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json", ".bun-version", "scripts/typecheck-projects.mjs", "scripts/lib/public-config.ts"]) {
  test(`selects all projects for global input ${file}`, () => {
    assert.deepEqual(selected([file]), ["contracts", "server", "web"]);
  });
}
test("maps deleted and untracked source by path", () => {
  assert.deepEqual(selected(["apps/server/src/deleted.ts", "apps/web/src/new.tsx"]), ["server", "web"]);
});
test("skips documentation and assets", () => {
  assert.deepEqual(selected(["README.md", "apps/web/docs/guide.md", "apps/web/public/logo.svg"]), []);
});
test("rejects unknown source ownership", () => {
  assert.throws(() => selected(["tooling/new.ts"]), /No typecheck ownership/);
});
test("reports selection reasons", () => {
  const plan = typecheckProjects(["packages/contracts/src/event.ts"], packages);
  assert.match(plan.reasons.get("web").join("; "), /consumer of contracts/);
});

test("checks every project for an unclassified JSON configuration", () => {
  assert.deepEqual(selected([".fleet-dev.json"]), ["contracts", "server", "web"]);
});
