import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, linkSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditSource, auditHistory, contentProblems, languageProblem, pathProblem } from "./audit-source.mjs";

test("source scope excludes local state, external links and unreviewed output", () => {
  for (const path of [".env", "apps/node/.env.local", "apps/web/node_modules/cache.js", ".sidelore/identity-vault.json", "research/runs/output.json", "notes.txt", "desktop-profile/Local State", "deploy/private.pem", "docs/../outside.md", "other-project/main.ts", "release/app.zip", "data/fixtures.bundle.json", "apps/web/public/data/records.json", "verification/checks.json", "verification/desktop-publication.png", "research/results.json", "apps/web/public/notes.json"])
    assert.ok(pathProblem(path), path);
  assert.ok(pathProblem("apps/web/src/linked.ts", "120000"));
  assert.ok(pathProblem("packages/external", "160000"));
  for (const path of ["README.md", "apps/web/src/main.tsx", "research/prize-topics.md", "deploy/network.example.json", "deploy/Dockerfile", "apps/web/public/manifest.webmanifest"])
    assert.equal(pathProblem(path), null, path);
});

test("audit checks staged bytes even when the working tree was subsequently cleaned", () => {
  const root = mkdtempSync(join(tmpdir(), "sidelore-source-audit-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
  try {
    git("init", "--quiet", "--template=", "--initial-branch=main");
    const path = ["", "Users", "example-person", "private-notes"].join("/") + "/";
    const secret = "gh" + "p_" + "X".repeat(40);
    writeFileSync(join(root, "README.md"), path + "\n" + secret);
    git("add", "--", "README.md");
    writeFileSync(join(root, "README.md"), "Clean working-tree text\n");
    const failed = auditSource(root);
    assert.equal(failed.passed, false);
    assert.ok(failed.issues.some(i => i.reason === "Personal absolute filesystem path"));
    assert.ok(failed.issues.some(i => i.reason === "GitHub credential"));
    assert.equal(JSON.stringify(failed.issues).includes(secret), false);
    git("add", "--", "README.md");
    assert.equal(auditSource(root).passed, true);
    mkdirSync(join(root, "nested"));
    assert.throws(() => auditSource(join(root, "nested")), /Git root must/);
    assert.equal(contentProblems(Buffer.from("const privateKey = createIdentity().privateKey;\n")).length, 0);
    linkSync(join(root, "README.md"), join(root, "nested", "linked.md"));
    assert.ok(auditSource(root).issues.some(i => i.reason === "Working-tree link or external path"));
    unlinkSync(join(root, "nested", "linked.md"));
    renameSync(join(root, ".git"), join(root, "metadata"));
    writeFileSync(join(root, ".git"), "gitdir: metadata\n");
    assert.throws(() => auditSource(root), /Repository metadata must/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("source review rejects personal mail and binary input while retaining localization", () => {
  assert.equal(contentProblems(Buffer.from("3072 <3072@users.invalid>")).length, 0);
  assert.equal(contentProblems(Buffer.from("person@example.com")).length, 0);
  const address = ["person", "private-mail.example"].join("@");
  const issues = contentProblems(Buffer.from(address));
  assert.ok(issues.some(i => i.reason === "Non-placeholder email address"));
  assert.equal(JSON.stringify(issues).includes(address), false);
  assert.ok(contentProblems(Buffer.from([0xff, 0xfe])).length);
  assert.ok(contentProblems(Buffer.from([65, 0, 66])).length);
  const translated = Buffer.from(String.fromCodePoint(0x7814));
  assert.ok(languageProblem("docs/proposal.md", translated));
  assert.equal(languageProblem("apps/web/src/translations.ts", translated), null);
});

test("history audit detects earlier content and attribution even after the current snapshot is clean", () => {
  const root = mkdtempSync(join(tmpdir(), "sidelore-history-audit-"));
  const env = {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "3072", GIT_AUTHOR_EMAIL: "3072@users.invalid",
    GIT_COMMITTER_NAME: "3072", GIT_COMMITTER_EMAIL: "3072@users.invalid",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  };
  const git = (...args) => execFileSync("git", args, { cwd: root, env });
  const commit = () => { git("add", "--", "README.md"); git("commit", "--quiet", "--no-gpg-sign", "-m", "Source checkpoint"); };
  try {
    git("init", "--quiet", "--template=", "--initial-branch=main");
    writeFileSync(join(root, "README.md"), "Clean source\n"); commit();
    assert.equal(auditHistory(root).passed, true);
    const secret = "gh" + "p_" + "X".repeat(40);
    writeFileSync(join(root, "README.md"), secret); commit();
    writeFileSync(join(root, "README.md"), "Clean source again\n");
    env.GIT_AUTHOR_NAME = "Other test author";
    commit();
    assert.equal(auditSource(root).passed, true);
    const history = auditHistory(root);
    assert.equal(history.commitCount, 3);
    assert.equal(history.passed, false);
    assert.ok(history.issues.some(i => i.reason === "GitHub credential"));
    assert.ok(history.issues.some(i => i.reason === "Unexpected author identity or timezone"));
    assert.equal(JSON.stringify(history.issues).includes(secret), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
