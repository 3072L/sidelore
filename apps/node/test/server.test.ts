import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSideloreServer } from "../src/server.js";
import { SideloreStore, LocalKeyStore } from "../../../packages/storage/src/index.js";
import { LocalResearchService } from "../src/local-service.js";
import { createIdentity, createTrailDraft, createFirstEvent, createNetworkPolicy, createResearchTopic, cidFromBytes, createSignedEvent } from "../../../packages/core/src/index.js";
import { approve, publicProfile } from "../../../packages/storage/test/helpers.js";

async function listen(app: ReturnType<typeof createSideloreServer>) {
  await new Promise<void>(done => app.server.listen(0, "127.0.0.1", done));
  const a = app.server.address(); assert.ok(a && typeof a !== "string"); return `http://127.0.0.1:${a.port}`;
}

test("public service never exposes workspace, management, MCP, old direct publication or unapproved filenames", async () => {
  const store = new SideloreStore(); publicProfile(store);
  const author = createIdentity("HTTP author"); store.registerIdentity(author.identity);
  const trail = createTrailDraft({ title: "Research with local evidence" }, author);
  const bytes = new TextEncoder().encode("private evidence bytes"), cid = cidFromBytes(bytes);
  const event = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "failure", payload: { note: "local-only experiment" }, artifactRefs: [{ cid, label: "company-confidential.txt", byteSize: bytes.length }], citationRefs: [], visibility: "public" }, author);
  store.publish(trail, [event]); store.saveArtifact({ cid, byteSize: bytes.length, checksum: cid, mediaType: "text/plain", encryptionMode: "none", sourceEventId: event.eventId }, bytes);
  const app = createSideloreServer({ store }), url = await listen(app);
  try {
    for (const path of ["/v1/backup", "/v1/drafts", "/v1/network/policy", "/v1/membership/changes", "/v1/audit", "/v1/identity", "/mcp", "/local"]) assert.equal((await fetch(url + path)).status, 404, path);
    assert.equal((await fetch(url + "/v1/topics?publicOnly=false")).status, 403);
    for (const path of ["/v1/export", "/v1/sync/manifest", "/v1/search?q=local", "/v1/topics"]) assert.equal((await (await fetch(url + path)).text()).includes("company-confidential"), false);
    assert.equal((await fetch(url + `/v1/artifacts/${cid}`)).status, 404);
    assert.equal((await fetch(url + "/v1/trails", { method: "POST", body: "{}" })).status, 404);
    approve(store, author, [{ kind: "trails", id: trail.trailId }, { kind: "events", id: event.eventId }, { kind: "artifacts", id: cid }]);
    const result = await (await fetch(url + "/v1/export")).json() as any;
    assert.equal(result.publications.length, 1); assert.match(JSON.stringify(result), /company-confidential/);
    assert.equal(await (await fetch(url + `/v1/artifacts/${cid}`)).text(), "private evidence bytes");
    const later = createSignedEvent({ recordId: trail.trailId, parentEventIds: [event.eventId], eventType: "result", payload: { note: "UNAPPROVED LATER" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author); store.appendEvent(later);
    assert.equal((await fetch(url + `/v1/events/${later.eventId}`)).status, 404);
  } finally { await app.close(); }
});

test("local human and scoped Agent APIs use the same service and MCP cannot grant or approve", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sidelore-local-http-"));
  const store = new SideloreStore(); publicProfile(store);
  const service = new LocalResearchService(store, new LocalKeyStore(join(dir, "vault.json")));
  const app = createSideloreServer({ store, localService: service, surface: "local", operatorToken: "operator-test-token" }), url = await listen(app);
  const post = (method: string, args: any = {}, token = app.operatorToken, origin?: string) => fetch(url + "/local", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify({ method, args }) });
  try {
    assert.equal((await post("research.list", {}, "")).status, 401);
    assert.equal((await post("research.list", {}, app.operatorToken, "https://untrusted.invalid")).status, 403);
    assert.equal((await post("identity.initialize", { displayName: "Human", passphrase: "fixture-passphrase" })).status, 200);
    const space = await (await post("workspace.create", { name: "Agent task", classification: "public-research" })).json() as any;
    const credential = await (await post("agent.create", { agentId: "agent-a", workspaceId: space.workspaceId })).json() as any;
    const saved = await (await post("research.save", { kind: "topic", question: "Agent research question" }, credential.token)).json() as any;
    assert.equal(saved.publication, "local-only"); assert.equal(store.searchTopics({ publicOnly: true }).length, 0);
    assert.equal(saved.result.createdBy, credential.signingIdentity.identityId);
    assert.equal(credential.signingIdentity.agentOrHuman, "agent");
    const prepared = await (await post("publication.prepare", { networkId: store.networkId(), topicId: saved.result.topicId, records: saved.records }, credential.token)).json() as any;
    assert.equal(prepared.status, "pending");
    for (const method of ["publication.approve", "grant.create", "workspace.create", "network.save", "identity.backup"]) {
      const response = await post(method, { intentId: prepared.intentId, contentCid: prepared.contentCid }, credential.token);
      assert.ok(response.status >= 400, method); assert.match(await response.text(), /Human-only/);
    }
    const approved = await (await post("publication.approve", { intentId: prepared.intentId, contentCid: prepared.contentCid })).json() as any;
    assert.equal(approved.status, "approved"); assert.equal(store.searchTopics({ publicOnly: true }).length, 1);
    const mcp = await fetch(url + "/mcp", { method: "POST", headers: { authorization: `Bearer ${credential.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    const tools = (await mcp.json() as any).result.tools;
    assert.ok(tools.some((t: any) => t.name === "prepare_publication"));
    assert.equal(tools.some((t: any) => /approve|grant_create|grant_revoke/.test(t.name)), false);
    assert.equal((await fetch(url + "/v1/trails", { method: "POST", headers: { authorization: `Bearer ${app.operatorToken}` }, body: "{}" })).status, 409);
    const backup = await (await post("backup.export")).json() as any;
    assert.equal(backup.publications, undefined); assert.equal(JSON.stringify(backup).includes("privateKey"), false);
  } finally { await app.close(); rmSync(dir, { recursive: true }); }
});

test("enabling a Bridge requires a separate exact snapshot approval and never exposes organization HTTP", async () => {
  const store = new SideloreStore(":memory:", { networkId: "org", networkMode: "isolated" });
  const author = createIdentity("Organization owner"); store.registerIdentity(author.identity);
  const topic = createResearchTopic({ question: "Private company study", visibility: "private" }, author); store.saveTopic(topic);
  store.saveNetworkPolicy(createNetworkPolicy({ networkId: "org", mode: "isolated", bridgeEnabled: true }, author));
  store.publications.saveProfile({ networkId: "public-bridge", name: "Public destination", kind: "public", bootstrap: [], indexes: [], listen: [], relayServer: false, autoConnect: false, cacheBytes: 1024 ** 3, memberPeerIds: [] });
  assert.equal(store.canFederate(), false);
  const app = createSideloreServer({ store }), url = await listen(app);
  try {
    assert.equal((await fetch(url + "/v1/topics")).status, 403);
    assert.throws(() => store.publications.prepare({ workspaceId: "local", networkId: "public-bridge", topicId: topic.topicId, records: [{ kind: "topics", id: topic.topicId }] }), /Bridge/);
    const i = store.publications.prepare({ workspaceId: "local", networkId: "public-bridge", topicId: topic.topicId, bridge: true, records: [{ kind: "topics", id: topic.topicId }] });
    assert.equal(store.publications.list("public-bridge").length, 0);
    store.publications.approve(i.intentId, i.contentCid, author);
    const envelope = store.publications.get(i.contentCid, "public-bridge")!;
    assert.equal(envelope.snapshot.bundle.topics![0].signature, topic.signature);
    assert.equal(store.publications.list("org").length, 0);
    assert.equal((await fetch(url + "/v1/export")).status, 403);
  } finally { await app.close(); }
});
