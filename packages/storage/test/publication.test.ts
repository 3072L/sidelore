import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SideloreStore } from "../src/index.js";
import { createIdentity, createResearchTopic, createFirstEvent, createTrailDraft, createSignedEvent, createTopicActivity, verifyPublication, cidFromBytes, signPublication, type RecordRef, type IdentityKeyPair } from "../../core/src/index.js";

import { publicProfile, approve } from "./helpers.js";
test("publication retains verifiable authorship without local identity recovery or passkey metadata", () => {
  const store = new SideloreStore();
  publicProfile(store);
  const author = createIdentity("Public author");
  author.identity.recoveryMetadata = { recoveryHint: "PRIVATE-RECOVERY-FIXTURE" };
  author.identity.boundPasskeys = ["PRIVATE-PASSKEY-FIXTURE"];
  store.registerIdentity(author.identity);
  const topic = createResearchTopic({ question: "Public research question" }, author);
  store.saveTopic(topic);
  const intent = store.publications.prepare({
    workspaceId: "local",
    networkId: store.networkId(),
    topicId: topic.topicId,
    records: [{ kind: "topics", id: topic.topicId }],
  });
  assert.equal(JSON.stringify(intent).includes("PRIVATE-"), false);
  store.publications.approve(intent.intentId, intent.contentCid, author);
  const exported = store.exportBundle({ publicOnly: true });
  assert.equal(JSON.stringify(exported).includes("PRIVATE-"), false);
  assert.deepEqual(exported.identities[0].boundPasskeys, []);
  assert.equal(exported.identities[0].recoveryMetadata, undefined);
  assert.equal(exported.publications![0].publisher.recoveryMetadata, undefined);
  assert.ok(verifyPublication(exported.publications![0], store.networkId()));
  assert.ok(JSON.stringify(store.exportBundle()).includes("PRIVATE-RECOVERY-FIXTURE"));
  assert.deepEqual(author.identity.boundPasskeys, ["PRIVATE-PASSKEY-FIXTURE"]);
  store.close();
});

test("frozen consent excludes later changes, private dependencies, old bundles and cancelled content", () => {
  const store = new SideloreStore(); publicProfile(store);
  const author = createIdentity("Author"); store.registerIdentity(author.identity);
  const trail = createTrailDraft({ title: "Approved research" }, author), first = createFirstEvent(trail, "hypothesis", { note: "Original" }, author);
  store.publish(trail, [first]);
  assert.equal(store.getPublicTrailRecord(trail.trailId), undefined);
  const i = store.publications.prepare({ workspaceId: "local", networkId: store.networkId(), topicId: "unscoped", records: [{ kind: "trails", id: trail.trailId }, { kind: "events", id: first.eventId }] });
  const second = createSignedEvent({ recordId: trail.trailId, parentEventIds: [first.eventId], eventType: "failure", payload: { note: "PRIVATE SECRET NOTE" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author);
  store.appendEvent(second);
  assert.throws(() => store.publications.approve(i.intentId, "wrong-cid", author), /changed/);
  store.publications.approve(i.intentId, i.contentCid, author);
  const exported = store.exportBundle({ publicOnly: true });
  assert.equal(exported.events.length, 1); assert.equal(JSON.stringify(exported).includes("PRIVATE SECRET NOTE"), false);
  assert.ok(verifyPublication(exported.publications![0], store.networkId()));
  assert.equal(store.searchTrails({ query: "SECRET", publicOnly: true }).length, 0);
  const recipient = new SideloreStore(); publicProfile(recipient);
  recipient.importBundle(exported, { publicOnly: true });
  assert.equal(recipient.getPublicEvent(first.eventId)?.eventId, first.eventId);
  assert.throws(() => recipient.importBundle(store.exportBundle(), { publicOnly: true }), /authorization required/);
  const restore = new SideloreStore(); restore.importBundle(exported); assert.equal(restore.manifest().events.length, 0);
  store.publications.cancel(i.intentId); assert.equal(store.manifest().events.length, 0);
  assert.equal(recipient.manifest().events.length, 1);
  store.close(); recipient.close(); restore.close();
});
test("dependency selection never recursively includes unpublished records", () => {
  const store = new SideloreStore(); publicProfile(store);
  const author = createIdentity("Author"); store.registerIdentity(author.identity);
  const t = createResearchTopic({ question: "Unpublished topic" }, author); store.saveTopic(t);
  const activity = createTopicActivity({ topicId: t.topicId, activityType: "summary", payload: { note: "result" } }, author); store.saveTopicActivity(activity);
  assert.throws(() => store.publications.prepare({ workspaceId: "local", networkId: store.networkId(), topicId: t.topicId, records: [{ kind: "topicActivities", id: activity.activityId }] }), /Unapproved dependency/);
  approve(store, author, [{ kind: "topics", id: t.topicId }], t.topicId);
  const i = store.publications.prepare({ workspaceId: "local", networkId: store.networkId(), topicId: t.topicId, records: [{ kind: "topicActivities", id: activity.activityId }] });
  assert.equal(i.preview.dependencies.length, 1); assert.equal(store.getTopicRecord(t.topicId, { publicOnly: true })?.activities.length, 0);
  store.close();
});
test("task grants remain bounded, revoked or expired across restart, and never restore from backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "sidelore-publication-")), path = join(dir, "node.db");
  let store = new SideloreStore(path); publicProfile(store);
  const author = createIdentity("Author"); store.registerIdentity(author.identity);
  const topic = createResearchTopic({ question: "Public task" }, author); store.saveTopic(topic);
  approve(store, author, [{ kind: "topics", id: topic.topicId }], topic.topicId);
  store.publications.saveWorkspace({ workspaceId: "task", name: "Public task", classification: "public-research", createdAt: new Date().toISOString() });
  const grant = store.publications.createGrant({ agentId: "agent-a", workspaceId: "task", topicId: topic.topicId, networkId: store.networkId(), contentTypes: ["topicActivities"], expiresAt: new Date(Date.now() + 60000).toISOString(), maxCount: 1, maxBytes: 100000 });
  const make = (note: string) => {
    const a = createTopicActivity({ topicId: topic.topicId, activityType: "summary", payload: { note } }, author); store.saveTopicActivity(a);
    store.publications.assign([{ kind: "topicActivities", id: a.activityId }], "task");
    return store.publications.prepare({ workspaceId: "task", networkId: store.networkId(), topicId: topic.topicId, records: [{ kind: "topicActivities", id: a.activityId }] }, "agent-a");
  };
  const i = make("First result");
  assert.throws(() => store.publications.approve(i.intentId, i.contentCid, author, undefined, "agent-a"), /cannot approve/);
  assert.equal(store.publications.approve(i.intentId, i.contentCid, author, grant.grantId, "agent-a").status, "approved");
  const over = make("Second result"); assert.equal(store.publications.approve(over.intentId, over.contentCid, author, grant.grantId, "agent-a").status, "pending");
  assert.match(store.publications.intent(over.intentId).lastError!, /quota/);
  store.publications.revokeGrant(grant.grantId); store.close();
  store = new SideloreStore(path);
  assert.equal(store.publications.canSend(store.publications.intent(i.intentId)), false);
  assert.equal(store.publications.grants()[0].usedCount, 1);
  assert.equal(store.getTopicRecord(topic.topicId, { publicOnly: true })?.activities.length, 0);
  const restored = new SideloreStore(); restored.importBundle(store.exportBundle());
  assert.equal(restored.publications.grants().length, 0); assert.equal(restored.manifest().events.length, 0);
  store.close(); restored.close(); rmSync(dir, { recursive: true });
});

test("a remote approved artifact cannot cause private local bytes with the same CID to be served", () => {
  const target = new SideloreStore(), remote = new SideloreStore(); publicProfile(target); publicProfile(remote);
  const author = createIdentity("Public author"); remote.registerIdentity(author.identity);
  const bytes = new TextEncoder().encode("Controlled private fixture"), cid = cidFromBytes(bytes);
  target.saveArtifact({ cid, byteSize: bytes.length, checksum: cid, mediaType: "text/plain", encryptionMode: "none" }, bytes);
  const trail = createTrailDraft({ title: "Public metadata" }, author);
  const event = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "result", payload: { note: "metadata only" }, artifactRefs: [{ cid }], citationRefs: [], visibility: "public" }, author);
  remote.publish(trail, [event]); remote.saveArtifact({ cid, byteSize: bytes.length, checksum: cid, mediaType: "text/plain", encryptionMode: "none", sourceEventId: event.eventId });
  approve(remote, author, [{ kind: "trails", id: trail.trailId }, { kind: "events", id: event.eventId }, { kind: "artifacts", id: cid }]);
  target.importBundle(remote.exportBundle({ publicOnly: true }), { publicOnly: true });
  assert.equal(target.getPublicArtifact(cid)?.data, undefined);
  assert.equal(target.exportBundle({ publicOnly: true, includeArtifactData: true }).artifactData?.[cid], undefined);
  target.close(); remote.close();
});

test("expiry, suspicious content, scope changes and quotas keep automatic publication in the human queue", () => {
  const store = new SideloreStore(); publicProfile(store); const author = createIdentity("Task owner"); store.registerIdentity(author.identity);
  const topic = createResearchTopic({ question: "Task boundary" }, author); store.saveTopic(topic); approve(store, author, [{ kind: "topics", id: topic.topicId }], topic.topicId);
  store.publications.saveWorkspace({ workspaceId: "task", name: "Task", classification: "public-research", createdAt: new Date().toISOString() });
  const grant = store.publications.createGrant({ workspaceId: "task", agentId: "agent-a", topicId: topic.topicId, networkId: store.networkId(), contentTypes: ["topicActivities"], expiresAt: new Date(Date.now() + 60000).toISOString(), maxCount: 3, maxBytes: 100000 });
  const create = (note: string, agent = "agent-a") => {
    const activity = createTopicActivity({ topicId: topic.topicId, activityType: "summary", payload: { note } }, author); store.saveTopicActivity(activity);
    const records: RecordRef[] = [{ kind: "topicActivities", id: activity.activityId }]; store.publications.assign(records, "task");
    return store.publications.prepare({ workspaceId: "task", networkId: store.networkId(), topicId: topic.topicId, records }, agent);
  };
  const secret = create("api_key=synthetic-secret-fixture-123456789"); assert.ok(secret.preview.warnings.length);
  assert.equal(store.publications.approve(secret.intentId, secret.contentCid, author, grant.grantId, "agent-a").status, "pending");
  const other = create("Outside agent", "agent-b"); assert.equal(store.publications.approve(other.intentId, other.contentCid, author, grant.grantId, "agent-b").status, "pending");
  const valid = create("Valid task result"); store.publications.approve(valid.intentId, valid.contentCid, author, grant.grantId, "agent-a");
  const persisted = store.publications.grants()[0]; persisted.expiresAt = "2000-01-01T00:00:00.000Z";
  store.db.prepare("UPDATE agent_publish_grants SET value=? WHERE id=?").run(JSON.stringify(persisted), grant.grantId);
  assert.equal(store.publications.canSend(store.publications.intent(valid.intentId)), false);
  assert.equal(store.publications.intents().find(i => i.intentId === valid.intentId)?.status, "pending");
  assert.equal(store.getTopicRecord(topic.topicId, { publicOnly: true })?.activities.length, 0);
  assert.throws(() => store.publications.saveWorkspace({ workspaceId: "task", name: "Changed", classification: "private", createdAt: new Date().toISOString() }), /immutable/);
  store.close();
});
