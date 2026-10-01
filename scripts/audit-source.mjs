import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootFiles = new Set([
  ".gitignore", ".dockerignore", ".gitattributes", ".env.example", ".env.sample", ".env.template",
  "README.md", "LICENSE", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "SUPPORT.md",
  "package.json", "package-lock.json", "pnpm-workspace.yaml", "tsconfig.json",
  "electron-builder.yml", "config.example.json", "index.html", "app.js",
  "styles.css", "manifest.webmanifest", "service-worker.js",
]);
const directories = new Set(["apps", "packages", "scripts", "docs", "schema", "deploy", "research", ".github"]);
const exactSourceFiles = new Set([
  "deploy/Dockerfile",
]);
const forbiddenDirectories = new Set([
  "node_modules", ".sidelore", "dist", "release", ".git", "desktop-profile", "__pycache__",
  ".cache", ".vite", "coverage", "test-results", "playwright-report", ".ssh", ".idea", ".vscode",
  "data", "datasets", "verification", "attachments", "backups", "exports", "uploads",
]);
const sourceExtensions = /\.(?:[cm]?[jt]sx?|json|md|css|html|ya?ml|toml|webmanifest|svg|sh|py)$/i;

export function pathProblem(path, mode = "100644") {
  if (!["100644", "100755"].includes(mode)) return "Symlink, submodule, or non-regular Git entry";
  const parts = path.split("/");
  const basename = parts.at(-1);
  if (!path || path.startsWith("/") || path.includes("\\") || parts.some(p => !p || p === "." || p === "..")) return "Invalid source path";
  if (parts.some(p => forbiddenDirectories.has(p))) return "Local state, dependency, or build directory";
  if (/^research\/(runs|local)\//.test(path)) return "Unreviewed local research output";
  if (path.startsWith("research/") && !path.endsWith(".md")) return "Only research proposal documents belong in source";
  if (path.startsWith("apps/web/public/") && !["apps/web/public/manifest.webmanifest", "apps/web/public/service-worker.js"].includes(path))
    return "Unreviewed public asset";
  if ((basename.startsWith(".env") && ![".env.example", ".env.sample", ".env.template"].includes(basename)) ||
      /^(?:\.npmrc|\.netrc|\.DS_Store|local-connection\.json|identity-vault\.json|os-protected-unlock|id_rsa.*|id_ed25519.*)$/.test(basename) ||
      /(?:\.sqlite(?:-(?:shm|wal))?|\.db(?:-(?:shm|wal))?|\.keys\.json|\.encrypted\.json|-backup\.json|passphrase\.local|\.(?:pem|key|p12|pfx|log|zip|tgz|dmg|exe|appimage|deb|pyc))$/i.test(basename)) return "Credential, database, backup, or generated file";
  if (exactSourceFiles.has(path)) return null;
  if (parts.length === 1) return rootFiles.has(path) ? null : "Not on the root-file allowlist";
  if (!directories.has(parts[0])) return "Not in an approved project source directory";
  if (!sourceExtensions.test(path)) return "Unexpected file type; review the source scope explicitly";
  return null;
}

const contentPatterns = [
  ["Personal absolute filesystem path", new RegExp(String.raw`(?:/` + String.raw`Users/[^/\s]+/|/` + String.raw`home/[^/\s]+/|[A-Za-z]:\\Users\\[^\\\r\n]+\\)`) ],
  ["Private key material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub credential", /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["API credential", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ["Cloud access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Credential in URL", /https?:\/\/[^\s/:"'<>]+:[^\s/@"'<>]+@/],
];
const genericLogins = new Set(["root", "node", "runner", "user", "test", "admin", "sidelore", "3072"]);
const privateMarkers = [homedir(), hostname(), userInfo().username]
  .filter(value => value.length >= 3 && !genericLogins.has(value.toLowerCase()));
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const privatePatterns = privateMarkers.map(value => new RegExp(`(?<![A-Za-z0-9_])${escaped(value)}(?![A-Za-z0-9_])`, "i"));
export function contentProblems(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return [{ reason: "Non-text file in source snapshot" }]; }
  if (text.includes("\0")) return [{ reason: "Binary content in source snapshot" }];
  const issues = [];
  for (const [reason, pattern] of contentPatterns) {
    const match = pattern.exec(text);
    if (match) issues.push({ reason, line: text.slice(0, match.index).split("\n").length });
  }
  if (privatePatterns.some(pattern => pattern.test(text))) issues.push({ reason: "Current machine identifier" });
  for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) {
    const domain = match[1].toLowerCase();
    if (!/(?:^|\.)example\.(?:com|org|net)$/.test(domain) && !domain.endsWith(".invalid")) {
      issues.push({ reason: "Non-placeholder email address", line: text.slice(0, match.index).split("\n").length });
      break;
    }
  }
  return issues;
}

export function languageProblem(path, bytes) {
  const localizationFiles = new Set(["apps/web/src/translations.ts", "apps/web/test/i18n.test.ts", "scripts/desktop-e2e.mjs"]);
  return !localizationFiles.has(path) && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(bytes.toString("utf8"))
    ? "Non-English text outside localization resources and tests" : null;
}

export function auditSource(root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), revision) {
  root = realpathSync(root);
  const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  const top = realpathSync(git("rev-parse", "--show-toplevel").toString().trim());
  if (top !== root) throw new Error("Git root must be the Sidelore project root, never a parent directory");
  const metadata = join(root, ".git");
  if (!lstatSync(metadata).isDirectory() || realpathSync(metadata) !== metadata ||
      realpathSync(git("rev-parse", "--absolute-git-dir").toString().trim()) !== metadata ||
      realpathSync(resolve(root, git("rev-parse", "--git-common-dir").toString().trim())) !== metadata)
    throw new Error("Repository metadata must stay inside the project");
  if (existsSync(join(metadata, "objects/info/alternates"))) throw new Error("Borrowed Git object stores are not permitted");
  if (revision && !/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("Expected an exact commit object ID");
  const rows = (revision ? git("ls-tree", "-r", "-z", "--full-tree", revision) : git("ls-files", "--stage", "-z")).toString().split("\0").filter(Boolean);
  if (!rows.length) throw new Error("No staged source files. Stage the intended project files first.");
  const issues = [], files = [];
  for (const row of rows) {
    const match = revision
      ? /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row)
      : /^(\d+) ([a-f0-9]+) (\d+)\t([\s\S]+)$/.exec(row);
    if (!match) throw new Error("Unrecognized Git index entry");
    const [, mode, field2, field3, path] = match;
    const objectId = revision ? field3 : field2;
    const stage = revision ? "0" : field3;
    const reason = stage !== "0" ? "Unmerged index entry" : pathProblem(path, mode);
    if (reason) { issues.push({ path, reason }); continue; }
    // Check every working-tree path component without following links into another directory.
    let location = root, outside = false;
    for (const part of path.split("/")) {
      location = join(location, part);
      try {
        const stat = lstatSync(location);
        if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) { outside = true; break; }
      }
      catch { /* A staged blob can remain after a local deletion; its bytes are still audited. */ }
    }
    if (outside || relative(root, location).startsWith("..")) { issues.push({ path, reason: "Working-tree link or external path" }); continue; }
    const bytes = git("cat-file", "blob", objectId);
    if (bytes.length > 5 * 1024 * 1024) issues.push({ path, reason: "Unexpected source file over 5 MiB" });
    for (const issue of contentProblems(bytes)) issues.push({ path, ...issue });
    const language = languageProblem(path, bytes);
    if (language) issues.push({ path, reason: language });
    files.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return { scope: revision ? "Sidelore committed source only" : "Sidelore staged source only", passed: issues.length === 0, fileCount: files.length, totalBytes: files.reduce((n, f) => n + f.bytes, 0), issues, files };
}

export function auditHistory(root = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 }).toString();
  const commits = git("rev-list", "--all").trim().split("\n").filter(Boolean);
  const issues = [];
  for (const commit of commits) {
    const raw = git("cat-file", "commit", commit);
    const [headers] = raw.split("\n\n");
    for (const role of ["author", "committer"]) {
      if (!headers.split("\n").some(line => new RegExp(`^${role} 3072 <3072@users\\.invalid> [0-9]+ \\+0000$`).test(line)))
        issues.push({ commit, reason: `Unexpected ${role} identity or timezone` });
    }
    if (/^gpgsig |^mergetag /m.test(headers)) issues.push({ commit, reason: "Signing identity or merged tag metadata" });
    if (/^(?:Co-authored-by|Signed-off-by):/mi.test(raw)) issues.push({ commit, reason: "Additional attribution trailer" });
    for (const issue of contentProblems(Buffer.from(raw))) issues.push({ commit, ...issue });
    for (const issue of auditSource(root, commit).issues) issues.push({ commit, ...issue });
  }
  return { passed: issues.length === 0, commitCount: commits.length, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = auditSource();
    if (process.argv.includes("--history")) {
      report.history = auditHistory();
      report.passed &&= report.history.passed;
    }
    if (process.argv.includes("--report")) {
      const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../release");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
    }
    for (const issue of report.issues) console.error(`${issue.path}${issue.line ? `:${issue.line}` : ""}: ${issue.reason}`);
    for (const issue of report.history?.issues ?? []) console.error(`${issue.commit.slice(0, 12)}${issue.path ? ` ${issue.path}` : ""}: ${issue.reason}`);
    const findings = report.issues.length + (report.history?.issues.length ?? 0);
    console.log(`${report.passed ? "PASS" : "FAIL"}: ${report.fileCount} staged source files, ${report.totalBytes} bytes; ${findings} findings${report.history ? ` across ${report.history.commitCount} commits` : ""}.`);
    if (!report.passed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
