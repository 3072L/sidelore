import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { SideloreStore } from "../dist/packages/storage/src/index.js";
import {
  createIdentity,
  createResearchTopic,
  createTopicActivity,
  createBundle,
  signPublication,
} from "../dist/packages/core/src/index.js";
import {
  createSideloreP2PNode,
  peerAddress,
  requestFromPeer,
} from "../dist/packages/sync/src/index.js";
import { privateKeyFromRaw } from "@libp2p/crypto/keys";
const nodeCount = Number(process.env.SIDELORE_SCALE_NODES ?? 20),
  contributions = Number(process.env.SIDELORE_SCALE_RECORDS ?? 10000);
assert.equal(contributions % nodeCount, 0);
const start = performance.now(),
  cpu = process.cpuUsage();
let peakRss = process.memoryUsage().rss,
  transferredBytes = 0,
  receivedSnapshots = 0,
  rounds = 0;
const networkId = "scale-local",
  authors = Array.from({ length: nodeCount }, (_, i) =>
    createIdentity(`Researcher ${i}`),
  );
const topic = createResearchTopic(
  { question: "Synthetic convergence benchmark; no real research" },
  authors[0],
);
const stores = [],
  nodes = [],
  cursors = new Map();
async function startNode(i) {
  return createSideloreP2PNode({
    privateKey: privateKeyFromRaw(
      Buffer.from(authors[i].privateKey, "base64url"),
    ),
    networkId,
    handler: async (req) => {
      if (req.type === "topic-page")
        return stores[i].publications.page(
          networkId,
          topic.topicId,
          req.after,
          req.limit,
        );
      if (req.type === "publication")
        return stores[i].publications.get(req.cid, networkId);
      throw new Error("Unsupported benchmark request");
    },
  });
}
try {
  for (let i = 0; i < nodeCount; i++) {
    const s = new SideloreStore();
    stores.push(s);
    s.publications.saveProfile({
      networkId,
      name: "Loopback benchmark",
      kind: "public",
      bootstrap: [],
      indexes: [],
      listen: ["/ip4/127.0.0.1/tcp/0"],
      relayServer: false,
      autoConnect: false,
      cacheBytes: 1024 ** 3,
      memberPeerIds: [],
    });
    s.setSetting("network_id", networkId);
    for (let offset = 0; offset < contributions / nodeCount; offset += 100) {
      const activities = Array.from(
        { length: Math.min(100, contributions / nodeCount - offset) },
        (_, j) =>
          createTopicActivity(
            {
              topicId: topic.topicId,
              activityType: "summary",
              payload: { note: `Synthetic contribution ${i}/${offset + j}` },
            },
            authors[i],
          ),
      );
      const bundle = createBundle({
        identities: [
          ...new Map(
            [authors[0].identity, authors[i].identity].map((a) => [
              a.identityId,
              a,
            ]),
          ).values(),
        ],
        trails: [],
        events: [],
        artifacts: [],
        reviews: [],
        forks: [],
        tombstones: [],
        topics: [topic],
        topicActivities: activities,
      });
      const snapshot = {
        protocol: "sidelore.publication/2",
        networkId,
        topicId: topic.topicId,
        bundle,
      };
      s.publications.accept(
        signPublication(snapshot, authors[i], "human"),
        networkId,
      );
    }
    nodes[i] = await startNode(i);
  }
  const expected = stores.reduce(
    (n, s) => n + s.publications.list(networkId).length,
    0,
  );
  // Disconnect and restart one transport using the persisted identity; the local content survives.
  const stablePeerId = nodes[0].peerId.toString();
  await nodes[0].stop();
  nodes[0] = await startNode(0);
  assert.equal(nodes[0].peerId.toString(), stablePeerId);
  for (rounds = 1; rounds <= nodeCount + 1; rounds++) {
    for (let i = 0; i < nodeCount; i++) {
      const remote = (i + 1) % nodeCount,
        cursorKey = `${i}:${remote}`;
      let after = cursors.get(cursorKey) ?? 0;
      for (;;) {
        const page = await requestFromPeer(
          nodes[i],
          peerAddress(nodes[remote]),
          {
            type: "topic-page",
            networkId,
            topicId: topic.topicId,
            after,
            limit: 100,
          },
        );
        for (const e of page.entries)
          if (!stores[i].publications.get(e.cid, networkId)) {
            const value = await requestFromPeer(
              nodes[i],
              peerAddress(nodes[remote]),
              { type: "publication", networkId, cid: e.cid },
            );
            transferredBytes += Buffer.byteLength(JSON.stringify(value));
            stores[i].publications.accept(value, networkId);
            receivedSnapshots++;
          }
        cursors.set(cursorKey, page.nextCursor);
        if (!page.hasMore || page.nextCursor === after) break;
        after = page.nextCursor;
      }
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
    console.log(
      `round ${rounds}: ${stores.map((s) => s.publications.list(networkId).length).join(",")}`,
    );
    if (stores.every((s) => s.publications.list(networkId).length === expected))
      break;
  }
  for (const s of stores)
    assert.equal(
      s.publications.view(networkId).listTopicActivities(topic.topicId).length,
      contributions,
    );
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const usage = process.cpuUsage(cpu);
  const result = {
    executedAt: new Date().toISOString(),
    mode: "20 independent libp2p nodes and SQLite stores in one process, TCP loopback ring; transport restart; synthetic signed records",
    nodeCount,
    contributions,
    snapshotsPerNode: expected,
    converged: true,
    rounds,
    seconds: (performance.now() - start) / 1000,
    peakProcessRssBytes: peakRss,
    cpuUserSeconds: usage.user / 1e6,
    cpuSystemSeconds: usage.system / 1e6,
    transferredSnapshotJsonBytes: transferredBytes,
    receivedSnapshots,
    scope:
      "Measures local convergence and aggregate resources, not WAN/NAT behavior or production capacity.",
  };
  mkdirSync("verification", { recursive: true });
  writeFileSync(
    "verification/scale-sync.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  for (const n of nodes) await n?.stop();
  for (const s of stores) s.close();
}
