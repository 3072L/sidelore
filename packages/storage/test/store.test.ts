import { publicProfile, approve } from "./helpers.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalKeyStore, SideloreStore } from "../src/index.js";
import { cidFromBytes, createIdentity, createMembershipChange, createNetworkPolicy, createResearchSubproblem, createResearchTopic, createSignedEvent, createSignedTombstone, createSignedTopicReview, createTopicActivity, createTrailDraft } from "../../core/src/index.js";

test("store persists immutable events, searches trails, and exports/imports", () => {
  const store = new SideloreStore(":memory:");
  const author = createIdentity("Storage author");
  store.registerIdentity(author.identity);
  const trail = createTrailDraft({ title: "A searchable failed experiment", abstract: "The counterexample remains unresolved.", domains: ["Mathematics"], tags: ["counterexample"] }, author, "2026-09-28T00:00:00.000Z");
  store.saveTrail(trail);
  const fixtureBytes = new TextEncoder().encode("fixture");
  const fixtureCid = cidFromBytes(fixtureBytes);
  const event = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "counterexample", payload: { note: "synthetic" }, artifactRefs: [{ cid: fixtureCid, mediaType: "text/plain", byteSize: fixtureBytes.byteLength, encryptionMode: "none" }], citationRefs: [], visibility: "public" }, author, "2026-09-28T00:00:00.000Z");
  store.appendEvent(event);
  store.saveArtifact({ cid: fixtureCid, mediaType: "text/plain", byteSize: fixtureBytes.byteLength, checksum: fixtureCid, encryptionMode: "none", sourceEventId: event.eventId }, fixtureBytes);
  assert.equal(store.getEvent(event.eventId)?.contentCid, event.contentCid);
  assert.equal(store.searchTrails({ query: "counterexample" }).length, 1);
  assert.equal(store.searchTrails({ publicOnly: true }).length, 0);
  approve(store, author, [{ kind: "trails", id: trail.trailId }, { kind: "events", id: event.eventId }, { kind: "artifacts", id: fixtureCid }]);
  assert.equal(store.searchTrails({ publicOnly: true }).length, 1);
  assert.throws(() => store.appendEvent({ ...event, payload: { note: "tampered" } }));
  const bundle = store.exportBundle();
  const restored = new SideloreStore(":memory:");
  assert.deepEqual(restored.importBundle(bundle), { importedTrails: 1, importedEvents: 1 });
  assert.equal(restored.getTrailRecord(trail.trailId)?.events.length, 1);
  assert.deepEqual(restored.getArtifact(fixtureCid)?.data, fixtureBytes);
  restored.importBundle(bundle);
  assert.equal(restored.getTrailRecord(trail.trailId)?.events.length, 1);
  store.close();
  restored.close();
});

test("tombstones mark trails retracted without deleting history", () => {
  const store = new SideloreStore(":memory:");
  const author = createIdentity("Tombstone author");
  store.registerIdentity(author.identity);
  const trail = createTrailDraft({ title: "Retractable trail" }, author);
  store.saveTrail(trail);
  store.saveTombstone(createSignedTombstone({ targetType: "trail", targetId: trail.trailId, reason: "author_request", createdAt: "2026-09-28T00:00:00.000Z" }, author));
  assert.equal(store.getTrail(trail.trailId)?.status, "retracted");
  assert.equal(store.getTrailRecord(trail.trailId)?.tombstones.length, 1);
  store.close();
});

test("private drafts stay out of public search and manifests", () => {
  const store = new SideloreStore(":memory:");
  const author = createIdentity("Private author");
  store.registerIdentity(author.identity);
  const trail = createTrailDraft({ title: "Private draft", visibility: "private" }, author);
  store.saveTrail(trail);
  assert.equal(store.searchTrails({ publicOnly: true }).length, 0);
  assert.equal(store.manifest().trails.length, 0);
  store.close();
});

test("public federation export omits private trails and events", () => {
  const store = new SideloreStore(":memory:");
  const author = createIdentity("Federation author");
  store.registerIdentity(author.identity);
  const publicTrail = createTrailDraft({ title: "Public trail" }, author);
  const privateTrail = createTrailDraft({ title: "Private trail", visibility: "private" }, author);
  store.saveTrail(publicTrail);
  store.saveTrail(privateTrail);
  const publicEvent = createSignedEvent({ recordId: publicTrail.trailId, parentEventIds: [], eventType: "result", payload: { visible: true }, artifactRefs: [], citationRefs: [], visibility: "public" }, author);
  const privateEvent = createSignedEvent({ recordId: privateTrail.trailId, parentEventIds: [], eventType: "failure", payload: { secret: true }, artifactRefs: [], citationRefs: [], visibility: "private" }, author);
  store.appendEvent(publicEvent);
  store.appendEvent(privateEvent);
  approve(store, author, [{ kind: "trails", id: publicTrail.trailId }, { kind: "events", id: publicEvent.eventId }]);
  const bundle = store.exportBundle({ publicOnly: true });
  assert.deepEqual(bundle.trails.map((trail) => trail.trailId), [publicTrail.trailId]);
  assert.deepEqual(bundle.events.map((event) => event.eventId), [publicEvent.eventId]);
  assert.ok(store.manifest().events.includes(publicEvent.contentCid));
  assert.equal(store.manifest().events.includes(privateEvent.contentCid), false);
  store.close();
});

test("registered human and agent identities can append signed events to one trail", () => {
  const store = new SideloreStore(":memory:");
  const author = createIdentity("Trail owner");
  const contributor = createIdentity("Analysis agent", "agent");
  store.registerIdentity(author.identity);
  store.registerIdentity(contributor.identity);
  const trail = createTrailDraft({ title: "Collaborative trail" }, author);
  store.saveTrail(trail);
  const first = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "hypothesis", payload: { claim: "synthetic" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author);
  const second = createSignedEvent({ recordId: trail.trailId, parentEventIds: [first.eventId], eventType: "counterexample", payload: { result: "agent found a counterexample" }, artifactRefs: [], citationRefs: [], visibility: "public" }, contributor);
  store.appendEvent(first);
  store.appendEvent(second);
  assert.deepEqual(store.getTrail(trail.trailId)?.contributors, [author.identity.identityId, contributor.identity.identityId].sort());
  approve(store, author, [{ kind: "trails", id: trail.trailId }, { kind: "events", id: first.eventId }, { kind: "events", id: second.eventId }]);
  assert.equal(store.getPublicTrailRecord(trail.trailId)?.events.at(-1)?.authorIdentityId, contributor.identity.identityId);
  store.close();
});

test("public search derives status from the public event projection", () => {
  const store = new SideloreStore(":memory:");
  const author = createIdentity("Projection author");
  store.registerIdentity(author.identity);
  const trail = createTrailDraft({ title: "Public status projection" }, author);
  store.saveTrail(trail);
  const visible = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "result", payload: { trailStatus: "active" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author, "2026-09-28T00:00:00.000Z");
  const privateUpdate = createSignedEvent({ recordId: trail.trailId, parentEventIds: [visible.eventId], eventType: "failure", payload: { trailStatus: "negative", secret: true }, artifactRefs: [], citationRefs: [], visibility: "private" }, author, "2026-09-29T00:00:00.000Z");
  store.appendEvent(visible);
  store.appendEvent(privateUpdate);
  assert.equal(store.getTrail(trail.trailId)?.status, "negative");
  approve(store, author, [{ kind: "trails", id: trail.trailId }, { kind: "events", id: visible.eventId }]);
  assert.equal(store.getPublicTrailRecord(trail.trailId)?.trail.status, "active");
  assert.equal(store.searchTrails({ publicOnly: true, status: "active" }).length, 1);
  assert.equal(store.searchTrails({ publicOnly: true, status: "negative" }).length, 0);
  store.close();
});

test("retention purge removes expired bytes but keeps artifact metadata", () => {
  const store = new SideloreStore(":memory:");
  const author = createIdentity("Retention author");
  store.registerIdentity(author.identity);
  const trail = createTrailDraft({ title: "Retention trail" }, author);
  store.saveTrail(trail);
  const bytes = new TextEncoder().encode("expires");
  const cid = cidFromBytes(bytes);
  const event = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "result", payload: {}, artifactRefs: [{ cid, byteSize: bytes.byteLength, mediaType: "text/plain", encryptionMode: "none" }], citationRefs: [], visibility: "public" }, author, "2026-09-28T00:00:00.000Z");
  store.appendEvent(event);
  store.saveArtifact({ cid, mediaType: "text/plain", byteSize: bytes.byteLength, checksum: cid, encryptionMode: "none", sourceEventId: event.eventId, retentionPolicy: "expires", expiresAt: "2026-09-29T00:00:00.000Z" }, bytes);
  assert.deepEqual(store.getArtifact(cid)?.data, bytes);
  assert.equal(store.purgeExpiredArtifacts("2026-09-30T00:00:00.000Z"), 1);
  assert.equal(store.getArtifact(cid)?.data, undefined);
  assert.equal(store.getArtifact(cid)?.artifact.cid, cid);
  store.close();
});

test("local key vault round trips private identity material", () => {
  const author = createIdentity("Vault author");
  const vault = new LocalKeyStore(join(mkdtempSync(join(tmpdir(), "sidelore-vault-")), "keys.json"));
  vault.put(author, "fixture-passphrase");
  assert.deepEqual(vault.get(author.identity.identityId, "fixture-passphrase"), author);
  assert.throws(() => vault.get(author.identity.identityId, "wrong-passphrase"));
});

test("private topic coordination stays local until an explicit bridge policy", () => {
  const store = new SideloreStore(":memory:", { networkMode: "isolated", networkId: "org-topic" });
  const owner = createIdentity("Organization owner");
  const agent = createIdentity("Independent agent", "agent");
  store.registerIdentity(owner.identity);
  store.registerIdentity(agent.identity);
  const topic = createResearchTopic({ question: "Solve the shared objective", visibility: "private", governancePolicy: { requiredSignatures: 2, allowedMembers: [owner.identity.identityId, agent.identity.identityId] } }, owner);
  store.saveTopic(topic);
  const subproblem = createResearchSubproblem({ topicId: topic.topicId, title: "First subproblem", statement: "Find a useful reduction." }, owner);
  store.saveSubproblem(subproblem);
  store.saveMembershipChange(createMembershipChange({ networkId: "org-topic", memberIdentityId: agent.identity.identityId, action: "grant" }, [owner]));
  const handoff = createTopicActivity({ topicId: topic.topicId, subproblemId: subproblem.subproblemId, activityType: "handoff_requested", payload: { next: agent.identity.identityId } }, agent);
  store.saveTopicActivity(handoff);
  const status = createTopicActivity({ topicId: topic.topicId, activityType: "status_update", payload: { topicStatus: "active" }, approvalSigners: [agent] }, owner);
  store.saveTopicActivity(status);
  store.saveTopicReview(createSignedTopicReview({ topicId: topic.topicId, subproblemId: subproblem.subproblemId, status: "challenged", method: "independent check", result: "Needs another attempt", createdAt: new Date().toISOString() }, agent));
  const trail = createTrailDraft({ title: "A local attempt", topicId: topic.topicId, subproblemId: subproblem.subproblemId, visibility: "private" }, agent);
  store.saveTrail(trail);
  assert.equal(store.searchTopics({ publicOnly: true }).length, 0);
  assert.equal(store.canFederate(), false);
  const policy = createNetworkPolicy({ networkId: "org-topic", mode: "isolated", bridgeEnabled: true }, owner);
  store.saveNetworkPolicy(policy);
  assert.equal(store.canFederate(), false); // Enabling Bridge never connects an organization to public federation.
  const backup = store.exportBundle();
  assert.equal(backup.topics?.length, 1);
  assert.equal(backup.topicActivities?.length, 2);
  assert.equal(backup.topicReviews?.length, 1);
  assert.equal(backup.membershipChanges?.length, 1);
  const restored = new SideloreStore(":memory:", { networkMode: "isolated", networkId: "org-topic" });
  assert.deepEqual(restored.importBundle(backup), { importedTrails: 1, importedEvents: 0 });
  assert.equal(restored.getTopicRecord(topic.topicId)?.topic.derivedStatus, "active");
  assert.equal(restored.getTopicRecord(topic.topicId)?.reviews.length, 1);
  assert.equal(restored.listMembers().length, 2);
  store.close();
  restored.close();
});
