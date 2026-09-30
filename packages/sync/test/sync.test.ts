import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdentity } from "../../core/src/index.js";
import { createPeerCard, createSideloreP2PNode, missingCids, peerAddress, requestFromPeer, verifyPeerCard } from "../src/index.js";

test("manifest diff and signed peer cards are deterministic and verifiable", () => {
  const local = { nodeId: "local", generatedAt: "now", trails: [{ trailId: "a", updatedAt: "now", status: "active" as const, visibility: "public" as const }], events: ["e1"], artifacts: ["a1"], tombstones: [], reviews: [], forks: [] };
  const remote = { ...local, nodeId: "remote", trails: [...local.trails, { trailId: "b", updatedAt: "now", status: "active" as const, visibility: "public" as const }], events: ["e1", "e2"], artifacts: ["a1", "a2"] };
  assert.deepEqual(missingCids(local, remote), { trails: ["b"], events: ["e2"], artifacts: ["a2"] });
  const identity = createIdentity("Peer operator", "agent");
  const card = createPeerCard({ peerId: "peer-1", endpoint: "http://127.0.0.1:8787", capabilities: ["manifest", "bundle"], createdAt: "2026-09-28T00:00:00.000Z" }, identity);
  assert.equal(verifyPeerCard(card), true);
  assert.equal(verifyPeerCard({ ...card, endpoint: "http://evil.invalid" }), false);
});

test("two libp2p nodes exchange a framed request over the Sidelore protocol", async () => {
  const responder = await createSideloreP2PNode({
    handler: async (request, remotePeer) => ({ request, remotePeer })
  });
  const requester = await createSideloreP2PNode();
  try {
    await responder.start();
    await requester.start();
    const address = peerAddress(responder);
    assert.ok(address, "responder should expose a TCP multiaddress");
    const result = await requestFromPeer<{ request: { type: string }; remotePeer: string }>(requester, address, { type: "manifest" });
    assert.equal(result.request.type, "manifest");
    assert.ok(result.remotePeer.length > 10);
  } finally {
    await requester.stop();
    await responder.stop();
  }
});
