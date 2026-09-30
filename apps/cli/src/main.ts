import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { SideloreStore } from "../../../packages/storage/src/index.js";
import { verifyBundle, type Bundle } from "../../../packages/core/src/index.js";

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, (_key, item) => typeof item === "bigint" ? Number(item) : item, 2)}\n`);
}

function usage(exitCode = 1): never {
  process.stdout.write(`Sidelore local CLI\n\nUsage:\n  sidelore local <service.method> [input.json] [--connection connection.json]\n  sidelore [--db path] trail list [query]\n  sidelore [--db path] trail show <trailId>\n  sidelore [--db path] topic list [query]\n  sidelore [--db path] topic show <topicId>\n  sidelore [--db path] export [file] [--public]\n  sidelore [--db path] import <file> [--public]\n  sidelore [--db path] manifest\n  sidelore [--db path] stats\n  sidelore [--db path] network\n  sidelore verify <bundle.json>\n\nThe CLI only reads explicitly named files and local node databases.\n`);
  process.exit(exitCode);
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function readBundle(file: string): Bundle {
  return JSON.parse(readFileSync(resolve(file), "utf8")) as Bundle;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const args = [...argv];
  if (args[0] === "local") {
    args.shift();
    let connectionFile = process.env.SIDELORE_CONNECTION ?? ".sidelore/local-connection.json";
    const index = args.indexOf("--connection");
    if (index >= 0) { connectionFile = args[index + 1]; args.splice(index, 2); }
    const method = args.shift(); if (!method) throw new Error("Specify a local service method, such as network.status");
    const inputFile = args.shift();
    const input = inputFile ? JSON.parse(readFileSync(resolve(inputFile), "utf8")) : {};
    const connection = JSON.parse(readFileSync(resolve(connectionFile), "utf8"));
    const token = process.env.SIDELORE_AGENT_TOKEN ?? connection.operatorToken;
    if (!token) throw new Error("Local capability required");
    const response = await fetch(`${connection.baseUrl}/local`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ method, args: input }) });
    const result = await response.json() as any;
    if (!response.ok) throw new Error(result.error ?? `Local request failed: ${response.status}`);
    print(result); return;
  }
  let dbPath = process.env.SIDELORE_DB ?? ".sidelore/node.sqlite";
  const dbIndex = args.indexOf("--db");
  if (dbIndex >= 0) {
    if (!args[dbIndex + 1]) usage();
    dbPath = args[dbIndex + 1];
    args.splice(dbIndex, 2);
  }
  const command = args.shift();
  if (!command || command === "--help" || command === "help") usage(command ? 0 : 1);
  if (command === "verify") {
    const file = args.shift();
    if (!file) usage();
    const bundle = readBundle(file);
    const result = verifyBundle(bundle);
    print(result);
    if (!result.valid) process.exitCode = 2;
    return;
  }

  const store = new SideloreStore(dbPath);
  try {
    if (command === "manifest") { print(store.manifest()); return; }
    if (command === "stats") { print(store.stats()); return; }
    if (command === "network") { print({ policy: store.getNetworkPolicy(), mode: store.networkMode(), networkId: store.networkId(), members: store.listMembers(), bridgeEnabled: store.bridgeEnabled(), directoryEnabled: store.directoryEnabled() }); return; }
    if (command === "topic") {
      const subcommand = args.shift();
      if (subcommand === "list") { print(store.searchTopics({ query: args.shift(), publicOnly: false, limit: 100000 })); return; }
      if (subcommand === "show") {
        const topicId = args.shift();
        if (!topicId) usage();
        const record = store.getTopicRecord(topicId);
        if (!record) { process.exitCode = 1; print({ error: "Topic not found" }); return; }
        print(record);
        return;
      }
      usage();
    }
    if (command === "trail") {
      const subcommand = args.shift();
      if (subcommand === "list") {
        const query = args.shift();
        print(store.searchTrails({ query, publicOnly: true, limit: 100000 }));
        return;
      }
      if (subcommand === "show") {
        const trailId = args.shift();
        if (!trailId) usage();
        const record = store.getTrailRecord(trailId);
        if (!record) { process.exitCode = 1; print({ error: "Trail not found" }); return; }
        print(record);
        return;
      }
      usage();
    }
    if (command === "export") {
      const publicOnly = takeFlag(args, "--public");
      const file = args.shift();
      const bundle = store.exportBundle({ publicOnly });
      if (file) writeFileSync(resolve(file), `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
      else print(bundle);
      return;
    }
    if (command === "import") {
      const publicOnly = takeFlag(args, "--public");
      const file = args.shift();
      if (!file) usage();
      print(store.importBundle(readBundle(file), { publicOnly }));
      return;
    }
    usage();
  } finally {
    store.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) void runCli().catch(error => { console.error(error.message); process.exitCode = 1; });
