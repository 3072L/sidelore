import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyFromRaw } from "@libp2p/crypto/keys";
import { ResearchNetwork } from "../src/network.js";
import { SideloreStore } from "../../../packages/storage/src/index.js";
import { createIdentity, createResearchTopic, createResearchSubproblem, createTopicActivity, createSignedTopicReview, createTrailDraft, createFirstEvent, type PublishedSnapshot } from "../../../packages/core/src/index.js";
import { approve, publicProfile } from "../../../packages/storage/test/helpers.js";
import { createSideloreP2PNode, peerAddress, requestFromPeer } from "../../../packages/sync/src/index.js";

test("three independent nodes converge on attempts, failure evidence and reviews after publisher goes offline", { timeout: 45000 }, async () => {
  const stores = [new SideloreStore(), new SideloreStore(), new SideloreStore()];
  const authors = stores.map((s, index) => { publicProfile(s); const a = createIdentity(`Researcher ${index}`); s.registerIdentity(a.identity); return a; });
  const networks = stores.map((s, index) => new ResearchNetwork(s, () => privateKeyFromRaw(Buffer.from(authors[index].privateKey, "base64url")), 3600000));
  try {
    await networks[0].connect("test-public");
    const address = networks[0].node!.getMultiaddrs().find(a => a.toString().includes("/tcp/"))!.toString();
    for (let i = 1; i < 3; i++) { stores[i].publications.saveProfile({ ...stores[i].publications.profile("test-public"), bootstrap: [address] }); await networks[i].connect("test-public"); }
    const topic = createResearchTopic({ question: "Collaborate on a common conjecture" }, authors[0]); stores[0].saveTopic(topic);
    const sub = createResearchSubproblem({ topicId: topic.topicId, title: "Find a reduction", statement: "Test whether this decomposition is sufficient" }, authors[0]); stores[0].saveSubproblem(sub);
    for (const s of stores) s.publications.subscribe("test-public", topic.topicId);
    const root = approve(stores[0], authors[0], [{ kind: "topics", id: topic.topicId }, { kind: "subproblems", id: sub.subproblemId }], topic.topicId);
    await networks[0].sync();
    for (let i = 1; i < 3; i++) {
      await networks[i].sync();
      assert.ok(stores[i].publications.get(root.contentCid, "test-public"));
      stores[i].importBundle(stores[0].publications.get(root.contentCid, "test-public")!.snapshot.bundle);
    }
    const attempt = createTopicActivity({ topicId: topic.topicId, subproblemId: sub.subproblemId, activityType: "attempt_started", payload: { note: "Independent parallel attempt" } }, authors[1]); stores[1].saveTopicActivity(attempt);
    approve(stores[1], authors[1], [{ kind: "topicActivities", id: attempt.activityId }], topic.topicId);
    const trail = createTrailDraft({ title: "Reduction fails on boundary cases", topicId: topic.topicId, subproblemId: sub.subproblemId }, authors[2]);
    const failure = createFirstEvent(trail, "failure", { note: "The reduction assumption excludes a necessary case", trailStatus: "negative" }, authors[2]); stores[2].publish(trail, [failure]);
    const review = createSignedTopicReview({ topicId: topic.topicId, subproblemId: sub.subproblemId, status: "challenged", method: "Independent derivation", result: "Boundary assumption is unsupported", createdAt: new Date().toISOString() }, authors[2]); stores[2].saveTopicReview(review);
    approve(stores[2], authors[2], [{ kind: "trails", id: trail.trailId }, { kind: "events", id: failure.eventId }, { kind: "topicReviews", id: review.reviewId }], topic.topicId);
    for (const n of networks) await n.sync();
    for (const n of networks) await n.sync();
    for (const s of stores) {
      const record = s.getTopicRecord(topic.topicId, { publicOnly: true })!;
      assert.equal(record.activities.length, 1); assert.equal(record.reviews.length, 1); assert.equal(record.trails.length, 1);
    }
    assert.ok(stores[0].publications.intent(root.intentId).receivedBy.length >= 1);
    await networks[0].disconnect();
    const bAddress = peerAddress(networks[1].node!)!;
    const copied = await requestFromPeer<PublishedSnapshot>(networks[2].node!, bAddress, { type: "publication", networkId: "test-public", cid: root.contentCid });
    assert.equal(copied.snapshot.bundle.topics![0].topicId, topic.topicId);
    await assert.rejects(requestFromPeer(networks[2].node!, bAddress, { type: "publication", networkId: "another-network", cid: root.contentCid }), /Network ID/);
    const newcomer = new SideloreStore(); publicProfile(newcomer);
    const newAuthor = createIdentity("New participant");
    newcomer.publications.saveProfile({ ...newcomer.publications.profile("test-public"), bootstrap: [address, bAddress.toString()] });
    const newNetwork = new ResearchNetwork(newcomer, () => privateKeyFromRaw(Buffer.from(newAuthor.privateKey, "base64url")), 3600000);
    try {
      newcomer.publications.subscribe("test-public", topic.topicId, topic.contentCid);
      await newNetwork.connect("test-public");
      assert.equal(newcomer.getTopicRecord(topic.topicId, { publicOnly: true })?.reviews.length, 1);
      assert.equal(newcomer.getPublicEvent(failure.eventId)?.eventType, "failure");
    } finally { await newNetwork.disconnect(); newcomer.close(); }
  } finally { for (const n of networks) await n.disconnect(); for (const s of stores) s.close(); }
});

test("Circuit Relay v2 carries a request using a forced relay address", { timeout: 30000 }, async () => {
  const relay = await createSideloreP2PNode({ relayServer: true });
  let target: Awaited<ReturnType<typeof createSideloreP2PNode>> | undefined;
  let client: Awaited<ReturnType<typeof createSideloreP2PNode>> | undefined;
  try {
    const address = peerAddress(relay)!.toString();
    target = await createSideloreP2PNode({ listen: [`${address}/p2p-circuit`], handler: async () => ({ approved: true }) });
    client = await createSideloreP2PNode();
    const relayed = `${address}/p2p-circuit/p2p/${target.peerId}`;
    assert.deepEqual(await requestFromPeer(client, relayed, { type: "manifest" }), { approved: true });
  } finally { await client?.stop(); await target?.stop(); await relay.stop(); }
});
