import { randomUUID } from "node:crypto";
import {
  canonicalBytes,
  canonicalize,
  cidFromValue,
  cidFromBytes,
  createBundle,
  projectTrail,
  publicIdentity,
  recordId,
  recordKinds,
  scanPublication,
  verifyBundle,
  verifyPublication,
  signPublication,
  networkProfileSchema,
  grantInputSchema,
  prepareInputSchema,
  type AgentPublishGrant,
  type Bundle,
  type IdentityKeyPair,
  type NetworkProfile,
  type PreparePublicationInput,
  type PublicationIntent,
  type PublishedSnapshot,
  type RecordKind,
  type RecordRef,
  type ResearchWorkspace,
  type TopicSubscription,
} from "../../core/src/index.js";
import type { SideloreStore } from "./store.js";

const now = () => new Date().toISOString();
const key = (ref: RecordRef) => `${ref.kind}:${ref.id}`;
const empty = (): Bundle =>
  createBundle(
    {
      identities: [],
      trails: [],
      events: [],
      artifacts: [],
      reviews: [],
      forks: [],
      tombstones: [],
      topics: [],
      subproblems: [],
      topicActivities: [],
      topicReviews: [],
    },
    "1970-01-01T00:00:00.000Z",
  );
const parse = <T>(row: any, column = "value"): T =>
  JSON.parse(String(row[column]));

/** The only bridge from the workspace database to network-visible records. */
export class PublicationStore {
  private cache?: { revision: number; networkId: string; store: SideloreStore };
  private revision = 0;
  constructor(
    private store: SideloreStore,
    private createView: () => SideloreStore,
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS network_profiles (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriptions (network_id TEXT NOT NULL, topic_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(network_id,topic_id));
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS record_workspaces (ref TEXT PRIMARY KEY, workspace_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS publication_intents (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_publish_grants (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS published_snapshots (sequence INTEGER PRIMARY KEY AUTOINCREMENT, cid TEXT NOT NULL, network_id TEXT NOT NULL, topic_id TEXT NOT NULL, value TEXT NOT NULL, local_intent TEXT, byte_size INTEGER NOT NULL, UNIQUE(network_id,cid));
      CREATE INDEX IF NOT EXISTS publication_topic_page ON published_snapshots(network_id,topic_id,sequence);
      CREATE TABLE IF NOT EXISTS published_artifact_data (network_id TEXT NOT NULL, cid TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(network_id,cid));
      CREATE TABLE IF NOT EXISTS publication_record_hashes (network_id TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(network_id,kind,record_id));
    `);
    if (!this.workspaces().length)
      this.saveWorkspace({
        workspaceId: "local",
        name: "Local research",
        classification: "private",
        createdAt: now(),
      });
    if (!this.profiles().length)
      this.saveProfile({
        networkId: store.networkId(),
        name: "Local research",
        kind: "local",
        bootstrap: [],
        indexes: [],
        listen: ["/ip4/0.0.0.0/tcp/0"],
        relayServer: false,
        autoConnect: false,
        cacheBytes: 1024 ** 3,
        memberPeerIds: [],
      });
    if (!store.getSetting("publication_boundary_v2")) {
      // Old public flags and old peer lists are not consent. Do not infer any envelopes.
      store.setSetting("publication_boundary_v2", {
        migratedAt: now(),
        legacyRecordsRequireApproval: true,
      });
      store.setSetting("network_connected", false);
      store.setSetting("auto_connect_network", null);
    }
  }
  close() {
    this.cache?.store.close();
    this.cache = undefined;
  }
  private changed() {
    this.revision++;
    this.close();
  }
  invalidate() {
    this.changed();
  }
  profiles(): NetworkProfile[] {
    return this.store.db
      .prepare("SELECT value FROM network_profiles ORDER BY id")
      .all()
      .map((row) => parse(row));
  }
  profile(id: string): NetworkProfile {
    const row = this.store.db
      .prepare("SELECT value FROM network_profiles WHERE id=?")
      .get(id);
    if (!row) throw new Error("Unknown network profile");
    return parse(row);
  }
  saveProfile(input: NetworkProfile): NetworkProfile {
    const profile = networkProfileSchema.parse(input);
    const existing = this.profiles().find(
      (p) => p.networkId === profile.networkId,
    );
    if (existing && existing.kind !== profile.kind)
      throw new Error("Network kind is immutable; create a separate profile");
    this.store.db
      .prepare(
        "INSERT INTO network_profiles(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(profile.networkId, JSON.stringify(profile));
    return profile;
  }
  workspaces(): ResearchWorkspace[] {
    return this.store.db
      .prepare("SELECT value FROM workspaces ORDER BY id")
      .all()
      .map((row) => parse(row));
  }
  saveWorkspace(input: ResearchWorkspace): ResearchWorkspace {
    if (
      !input.workspaceId ||
      !input.name ||
      !["private", "public-research"].includes(input.classification)
    )
      throw new Error("Invalid workspace");
    const old = this.workspaces().find(
      (w) => w.workspaceId === input.workspaceId,
    );
    if (old && canonicalize(old) !== canonicalize(input))
      throw new Error(
        "Workspace classification is immutable; create a new workspace",
      );
    this.store.db
      .prepare("INSERT OR IGNORE INTO workspaces(id,value) VALUES (?,?)")
      .run(input.workspaceId, JSON.stringify(input));
    return input;
  }
  assign(refs: RecordRef[], workspaceId: string) {
    if (!this.workspaces().some((w) => w.workspaceId === workspaceId))
      throw new Error("Unknown workspace");
    for (const ref of refs) {
      const old = this.store.db
        .prepare("SELECT workspace_id FROM record_workspaces WHERE ref=?")
        .get(key(ref));
      if (old && old.workspace_id !== workspaceId)
        throw new Error("Record workspace is immutable");
      this.store.db
        .prepare(
          "INSERT OR IGNORE INTO record_workspaces(ref,workspace_id) VALUES (?,?)",
        )
        .run(key(ref), workspaceId);
    }
  }
  workspaceOf(ref: RecordRef): string {
    return String(
      this.store.db
        .prepare("SELECT workspace_id FROM record_workspaces WHERE ref=?")
        .get(key(ref))?.workspace_id ?? "local",
    );
  }
  subscriptions(networkId?: string): TopicSubscription[] {
    return (
      networkId
        ? this.store.db
            .prepare("SELECT value FROM subscriptions WHERE network_id=?")
            .all(networkId)
        : this.store.db.prepare("SELECT value FROM subscriptions").all()
    ).map((row) => parse(row));
  }
  subscribe(
    networkId: string,
    topicId: string,
    rootCid?: string,
  ): TopicSubscription {
    this.profile(networkId);
    if (!topicId || topicId.length > 512) throw new Error("Invalid topic ID");
    const current = this.subscriptions(networkId).find(
      (s) => s.topicId === topicId,
    );
    const sub: TopicSubscription = current ?? {
      networkId,
      topicId,
      ...(rootCid ? { rootCid } : {}),
      subscribedAt: now(),
      cursors: {},
    };
    this.saveSubscription(sub);
    return sub;
  }
  saveSubscription(sub: TopicSubscription) {
    this.store.db
      .prepare(
        "INSERT INTO subscriptions(network_id,topic_id,value) VALUES (?,?,?) ON CONFLICT(network_id,topic_id) DO UPDATE SET value=excluded.value",
      )
      .run(sub.networkId, sub.topicId, JSON.stringify(sub));
  }
  unsubscribe(networkId: string, topicId: string) {
    this.store.db
      .prepare("DELETE FROM subscriptions WHERE network_id=? AND topic_id=?")
      .run(networkId, topicId);
  }
  intents(): PublicationIntent[] {
    const intents = this.store.db
      .prepare("SELECT value FROM publication_intents ORDER BY rowid DESC")
      .all()
      .map((row) => parse<PublicationIntent>(row));
    let expired = false;
    for (const i of intents)
      if (i.status === "approved" && i.grantId && !i.propagatedAt) {
        const error = this.checkGrant(
          this.grants().find((g) => g.grantId === i.grantId),
          i,
          true,
        );
        if (error) {
          i.status = "pending";
          i.lastError = `${error}; human review required`;
          this.saveIntent(i);
          expired = true;
        }
      }
    if (expired) this.changed();
    return intents;
  }
  intent(id: string): PublicationIntent {
    const row = this.store.db
      .prepare("SELECT value FROM publication_intents WHERE id=?")
      .get(id);
    if (!row) throw new Error("Unknown publication intent");
    return parse(row);
  }
  private saveIntent(intent: PublicationIntent) {
    this.store.db
      .prepare(
        "INSERT INTO publication_intents(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(intent.intentId, JSON.stringify(intent));
  }

  prepare(input: PreparePublicationInput, agentId?: string): PublicationIntent {
    const args = prepareInputSchema.parse(input);
    const profile = this.profile(args.networkId);
    if (profile.kind === "local")
      throw new Error(
        "Select an organization or public network before preparing publication",
      );
    if (!this.workspaces().some((w) => w.workspaceId === args.workspaceId))
      throw new Error("Unknown workspace");
    if (args.bridge && (agentId || !this.store.bridgeEnabled()))
      throw new Error(
        "Bridge requires local human access and an enabled policy",
      );
    const sourceProfile = this.profiles().find(
      (p) => p.networkId === this.store.networkId(),
    );
    if (
      this.store.networkId() !== profile.networkId &&
      (sourceProfile?.kind === "organization" ||
        (this.store.listMembers().length > 0 &&
          this.store.getNetworkPolicy())) &&
      !args.bridge &&
      profile.kind === "public"
    )
      throw new Error(
        "Organization to public transfer requires an explicit Bridge snapshot",
      );
    const source = this.store.exportBundle({
      publicOnly: false,
      includeArtifactData: false,
      includeMembership: false,
    });
    const catalog = new Map<string, any>();
    for (const kind of recordKinds)
      for (const value of source[kind] ?? [])
        catalog.set(key({ kind, id: recordId(kind, value) }), value);
    const approved = this.view(args.networkId).exportBundle({
      publicOnly: false,
      includeArtifactData: false,
      includeMembership: false,
    });
    const publicCatalog = new Map<string, any>();
    for (const kind of recordKinds)
      for (const value of approved[kind] ?? [])
        publicCatalog.set(key({ kind, id: recordId(kind, value) }), value);
    const selected = new Map<string, { ref: RecordRef; value: any }>();
    const dependencies: RecordRef[] = [];
    for (const ref of args.records) {
      const value = catalog.get(key(ref)) ?? publicCatalog.get(key(ref));
      if (!value) throw new Error(`Missing record ${key(ref)}`);
      if (
        !publicCatalog.has(key(ref)) &&
        this.workspaceOf(ref) !== args.workspaceId
      )
        throw new Error(
          `Record is outside the selected workspace: ${key(ref)}`,
        );
      selected.set(key(ref), { ref, value });
    }
    const requireRef = (kind: RecordKind, id?: string) => {
      if (!id) return;
      const ref = { kind, id },
        k = key(ref);
      if (selected.has(k)) return;
      const value = publicCatalog.get(k);
      if (!value)
        throw new Error(
          `Unapproved dependency ${k}; explicitly select it or create a new signed summary`,
        );
      selected.set(k, { ref, value });
      dependencies.push(ref);
    };
    // Iterate the growing map: only already-approved dependencies may be added recursively.
    for (const { ref, value: v } of selected.values()) {
      if (v.topicId && ref.kind !== "topics") requireRef("topics", v.topicId);
      if (v.subproblemId && ref.kind !== "subproblems")
        requireRef("subproblems", v.subproblemId);
      if (ref.kind === "subproblems") {
        for (const id of v.dependsOn) requireRef("subproblems", id);
        for (const id of v.linkedTrailIds) requireRef("trails", id);
      }
      if (ref.kind === "trails")
        for (const id of v.verificationEvidenceIds ?? [])
          requireRef("events", id);
      if (ref.kind === "events") {
        requireRef("trails", v.recordId);
        for (const id of v.parentEventIds) requireRef("events", id);
        for (const c of v.citationRefs) {
          requireRef("trails", c.recordId);
          requireRef("events", c.eventId);
        }
        for (const a of v.artifactRefs) requireRef("artifacts", a.cid);
      }
      if (ref.kind === "reviews") {
        requireRef("trails", v.trailId);
        requireRef("events", v.eventId);
      }
      if (ref.kind === "forks") {
        requireRef("trails", v.sourceTrailId);
        requireRef("trails", v.newTrailId);
        requireRef("events", v.sourceEventId);
      }
      if (ref.kind === "artifacts") {
        requireRef("events", v.sourceEventId);
        if (
          v.retentionPolicy === "local_only" ||
          (v.expiresAt && v.expiresAt <= now())
        )
          throw new Error(
            "Local-only or expired attachments cannot be published",
          );
      }
      // Signed arbitrary payloads are never rewritten. Recognized reference fields are checked.
      if (ref.kind === "topicActivities") {
        for (const id of [v.payload.trailId, ...(v.payload.trailIds ?? [])])
          if (typeof id === "string") requireRef("trails", id);
        for (const id of [v.payload.eventId, ...(v.payload.eventIds ?? [])])
          if (typeof id === "string") requireRef("events", id);
        for (const a of v.payload.artifactRefs ?? [])
          if (a?.cid) requireRef("artifacts", a.cid);
      }
    }
    const bundle = empty();
    for (const { ref, value } of selected.values())
      (bundle[ref.kind] as any[]).push(structuredClone(value));
    bundle.trails = bundle.trails.map((t) => {
      const p = projectTrail(
        t,
        bundle.events.filter((e) => e.recordId === t.trailId),
      );
      delete p.derivedVerificationState;
      return p;
    });
    for (const t of bundle.topics ?? []) delete t.derivedStatus;
    for (const s of bundle.subproblems ?? []) delete s.derivedStatus;
    const identities = new Set<string>();
    for (const { value: v } of selected.values()) {
      for (const id of [
        v.createdBy,
        v.authorIdentityId,
        v.reviewerIdentityId,
        v.requestedBy,
        v.provenance?.authorIdentityId,
        ...(v.governanceApprovals ?? []).map((a: any) => a.identityId),
      ])
        if (id) identities.add(id);
    }
    bundle.identities = [
      ...new Map(
        [...source.identities, ...approved.identities]
          .filter((i) => identities.has(i.identityId))
          .map((i) => [i.identityId, publicIdentity(i)]),
      ).values(),
    ];
    for (const kind of recordKinds)
      (bundle[kind] as any[]).sort((a, b) =>
        recordId(kind, a).localeCompare(recordId(kind, b)),
      );
    bundle.identities.sort((a, b) => a.identityId.localeCompare(b.identityId));
    const validation = verifyBundle(bundle);
    if (!validation.valid)
      throw new Error(`Invalid publication: ${validation.errors.join("; ")}`);
    const topicIds = new Set((bundle.topics ?? []).map((t) => t.topicId));
    if (args.topicId !== "unscoped" && !topicIds.has(args.topicId))
      throw new Error("Publication must include the selected topic");
    const snapshot = {
      protocol: "sidelore.publication/2" as const,
      networkId: args.networkId,
      topicId: args.topicId,
      bundle,
    };
    const attachments = bundle.artifacts.map((a) => ({
      cid: a.cid,
      byteSize: a.byteSize,
      filenames: bundle.events.flatMap((e) =>
        e.artifactRefs
          .filter((r) => r.cid === a.cid)
          .map((r) => r.label ?? a.cid),
      ),
    }));
    const scan = scanPublication({
      text: canonicalize(bundle) + bundle.artifacts.filter(a => a.encryptionMode === "none").map(a => {
        const bytes = this.store.getArtifact(a.cid)?.data ?? this.artifactBytes(args.networkId, a.cid);
        return bytes ? Buffer.from(bytes.subarray(0, 8 * 1024 * 1024)).toString("utf8") : "";
      }).join("\n"),
      license: "included in preview",
      artifactBytes: attachments.reduce((n, a) => n + a.byteSize, 0),
    });
    if (bundle.artifacts.some(a => a.byteSize > 8 * 1024 * 1024)) scan.warnings.push({ kind: "large_artifact", message: "Attachment exceeds the automatic content inspection limit; human review required." });
    const intent: PublicationIntent = {
      intentId: randomUUID(),
      workspaceId: args.workspaceId,
      ...(agentId ? { agentId } : {}),
      bridge: args.bridge,
      snapshot,
      contentCid: cidFromValue(snapshot),
      createdAt: now(),
      status: "pending",
      receivedBy: [],
      attempts: 0,
      preview: {
        records: [...new Map(args.records.map((r) => [key(r), r])).values()],
        dependencies,
        attachments,
        totalBytes:
          canonicalBytes(snapshot).length +
          attachments.reduce((n, a) => n + a.byteSize, 0),
        warnings: scan.warnings.map((w) => w.message),
      },
    };
    this.saveIntent(intent);
    return this.intent(intent.intentId);
  }
  grants(): AgentPublishGrant[] {
    return this.store.db
      .prepare("SELECT value FROM agent_publish_grants")
      .all()
      .map((row) => parse(row));
  }
  createGrant(input: unknown): AgentPublishGrant {
    const args = grantInputSchema.parse(input);
    const workspace = this.workspaces().find(
      (w) => w.workspaceId === args.workspaceId,
    );
    if (workspace?.classification !== "public-research")
      throw new Error(
        "Automatic publication requires an explicitly public research workspace",
      );
    if (this.profile(args.networkId).kind !== "public")
      throw new Error(
        "Automatic grants are only for a public research network",
      );
    if (args.expiresAt <= now())
      throw new Error("Grant expiry must be in the future");
    const grant: AgentPublishGrant = {
      ...args,
      grantId: randomUUID(),
      createdAt: now(),
      usedCount: 0,
      usedBytes: 0,
    };
    this.saveGrant(grant);
    return grant;
  }
  private saveGrant(g: AgentPublishGrant) {
    this.store.db
      .prepare(
        "INSERT INTO agent_publish_grants(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(g.grantId, JSON.stringify(g));
  }
  revokeGrant(id: string) {
    const grant = this.grants().find((g) => g.grantId === id);
    if (!grant) throw new Error("Unknown grant");
    grant.revokedAt = now();
    this.saveGrant(grant);
    for (const i of this.intents().filter(
      (i) => i.grantId === id && !i.propagatedAt,
    )) {
      i.status = "pending";
      i.lastError = "Grant revoked; human review required";
      this.saveIntent(i);
    }
    this.changed();
    return grant;
  }
  private checkGrant(
    g: AgentPublishGrant | undefined,
    i: PublicationIntent,
    consumed = false,
  ): string | undefined {
    if (!g || g.revokedAt || g.expiresAt <= now())
      return "Grant expired or revoked";
    if (
      i.bridge ||
      this.workspaces().find((w) => w.workspaceId === i.workspaceId)
        ?.classification !== "public-research"
    )
      return "Human confirmation is required for this workspace";
    if (
      g.agentId !== i.agentId ||
      g.workspaceId !== i.workspaceId ||
      g.topicId !== i.snapshot.topicId ||
      g.networkId !== i.snapshot.networkId
    )
      return "Grant scope mismatch";
    if (i.preview.warnings.length)
      return "Suspicious content requires human review";
    if (i.preview.attachments.length && !g.allowAttachments)
      return "Attachments require human review";
    if (i.preview.records.some((r) => !g.contentTypes.includes(r.kind)))
      return "Content type is outside grant scope";
    // Dependencies from a different topic cannot expand a task grant.
    if (
      (i.snapshot.bundle.topics ?? []).some((t) => t.topicId !== g.topicId) ||
      i.snapshot.bundle.trails.some((t) => t.topicId !== g.topicId)
    )
      return "Content belongs to another topic";
    if (
      !consumed &&
      (g.usedCount >= g.maxCount ||
        g.usedBytes + i.preview.totalBytes > g.maxBytes)
    )
      return "Grant quota exceeded";
    return undefined;
  }
  approve(
    id: string,
    expectedCid: string,
    publisher: IdentityKeyPair,
    grantId?: string,
    agentId?: string,
  ): PublicationIntent {
    return this.store.transaction(() => {
      const intent = this.intent(id);
      if (
        intent.status !== "pending" ||
        expectedCid !== intent.contentCid ||
        cidFromValue(intent.snapshot) !== expectedCid
      )
        throw new Error("Publication snapshot changed or is no longer pending");
      if (agentId && (intent.agentId !== agentId || !grantId))
        throw new Error("Agent cannot approve a publication manually");
      if (grantId) {
        const grant = this.grants().find((g) => g.grantId === grantId);
        const reason = this.checkGrant(grant, intent);
        if (reason) {
          intent.lastError = reason;
          this.saveIntent(intent);
          return intent;
        }
        grant!.usedCount++;
        grant!.usedBytes += intent.preview.totalBytes;
        this.saveGrant(grant!);
        intent.grantId = grantId;
      } else {
        delete intent.grantId;
      }
      intent.status = "approved";
      delete intent.lastError;
      this.saveIntent(intent);
      this.accept(
        signPublication(
          intent.snapshot,
          publisher,
          grantId ? "grant" : "human",
        ),
        intent.snapshot.networkId,
        intent.intentId,
      );
      return this.intent(id);
    });
  }
  cancel(id: string): PublicationIntent {
    const i = this.intent(id);
    i.status = i.propagatedAt ? "withdrawal-requested" : "cancelled";
    this.saveIntent(i);
    this.changed();
    return i;
  }
  canSend(i: PublicationIntent): boolean {
    if (i.status !== "approved") return false;
    if (
      i.grantId &&
      this.checkGrant(
        this.grants().find((g) => g.grantId === i.grantId),
        i,
        true,
      )
    )
      return false;
    return true;
  }
  sent(cid: string, peer?: string) {
    for (const i of this.intents().filter(
      (i) => i.contentCid === cid && this.canSend(i),
    )) {
      i.propagatedAt ??= now();
      if (peer && !i.receivedBy.includes(peer)) i.receivedBy.push(peer);
      delete i.lastError;
      delete i.nextRetryAt;
      this.saveIntent(i);
    }
  }
  notePublicRead(body: unknown) {
    const encoded = JSON.stringify(body);
    for (const value of this.list(this.store.networkId())) {
      if (
        encoded.includes(value.envelope.signature) ||
        recordKinds.some((kind) =>
          (value.snapshot.bundle[kind] ?? []).some(
            (r: any) => r.signature && encoded.includes(r.signature),
          ),
        )
      )
        this.sent(value.envelope.contentCid);
    }
  }
  failed(id: string, message: string) {
    const i = this.intent(id);
    i.attempts++;
    i.lastError = message;
    i.nextRetryAt = new Date(
      Date.now() + Math.min(300000, 1000 * 2 ** Math.min(i.attempts, 8)),
    ).toISOString();
    this.saveIntent(i);
  }
  accept(
    value: PublishedSnapshot,
    networkId: string,
    localIntent?: string,
  ): boolean {
    return this.store.transaction(() =>
      this.acceptSnapshot(value, networkId, localIntent),
    );
  }
  private acceptSnapshot(
    value: PublishedSnapshot,
    networkId: string,
    localIntent?: string,
  ): boolean {
    const profile = this.profile(networkId);
    if (!verifyPublication(value, networkId))
      throw new Error("Invalid publication envelope or snapshot");
    const existing = this.store.db
      .prepare("SELECT 1 FROM published_snapshots WHERE network_id=? AND cid=?")
      .get(networkId, value.envelope.contentCid);
    if (existing) {
      if (localIntent) {
        this.store.db
          .prepare(
            "UPDATE published_snapshots SET sequence=(SELECT COALESCE(MAX(sequence),0)+1 FROM published_snapshots),value=?,local_intent=? WHERE network_id=? AND cid=?",
          )
          .run(
            JSON.stringify(value),
            localIntent,
            networkId,
            value.envelope.contentCid,
          );
        for (const a of value.snapshot.bundle.artifacts) {
          const saved = this.store.getArtifact(a.cid);
          if (saved?.data && !saved.revoked)
            this.store.db
              .prepare(
                "INSERT OR IGNORE INTO published_artifact_data(network_id,cid,data) VALUES (?,?,?)",
              )
              .run(networkId, a.cid, Buffer.from(saved.data));
        }
        this.changed();
      }
      return false;
    }
    const size = canonicalBytes(value).length;
    const used = Number(
      this.store.db
        .prepare(
          "SELECT COALESCE(SUM(byte_size),0) AS n FROM published_snapshots WHERE network_id=? AND local_intent IS NULL",
        )
        .get(networkId)?.n ?? 0,
    );
    if (!localIntent && used + size > profile.cacheBytes)
      throw new Error(
        "Automatic cache limit reached; increase the limit or remove subscriptions",
      );
    // Validate graph/ownership in a throwaway store before committing anything to the public library.
    const check = this.createView();
    try {
      check.importBundle(value.snapshot.bundle);
    } finally {
      check.close();
    }
    for (const kind of recordKinds)
      for (const record of value.snapshot.bundle[kind] ?? []) {
        const id = recordId(kind, record),
          r = record as any;
        const hash = r.contentCid ?? cidFromValue(record);
        const old = this.store.db
          .prepare(
            "SELECT hash FROM publication_record_hashes WHERE network_id=? AND kind=? AND record_id=?",
          )
          .get(networkId, kind, id);
        if (old && old.hash !== hash)
          throw new Error("Conflicting signed record ID in publication");
        this.store.db
          .prepare(
            "INSERT OR IGNORE INTO publication_record_hashes(network_id,kind,record_id,hash) VALUES (?,?,?,?)",
          )
          .run(networkId, kind, id, hash);
      }
    this.store.db
      .prepare(
        "INSERT INTO published_snapshots(cid,network_id,topic_id,value,local_intent,byte_size) VALUES (?,?,?,?,?,?)",
      )
      .run(
        value.envelope.contentCid,
        networkId,
        value.snapshot.topicId,
        JSON.stringify(value),
        localIntent ?? null,
        size,
      );
    // A peer's envelope can never authorize reading matching bytes from our private workspace.
    if (localIntent)
      for (const artifact of value.snapshot.bundle.artifacts) {
        const local = this.store.getArtifact(artifact.cid);
        if (local?.data && !local.revoked)
          this.store.db
            .prepare(
              "INSERT OR IGNORE INTO published_artifact_data(network_id,cid,data) VALUES (?,?,?)",
            )
            .run(networkId, artifact.cid, Buffer.from(local.data));
      }
    this.changed();
    return true;
  }
  private allowed(row: any): boolean {
    const hidden = this.store.db
      .prepare("SELECT target_id FROM moderation WHERE hidden=1")
      .all()
      .map((r) => String(r.target_id));
    if (hidden.length) {
      const publication = parse<PublishedSnapshot>(row);
      if (
        recordKinds.some((kind) =>
          (publication.snapshot.bundle[kind] ?? []).some((value) =>
            hidden.includes(recordId(kind, value)),
          ),
        )
      )
        return false;
    }
    if (!row.local_intent) return true;
    try {
      const intent = this.intent(String(row.local_intent));
      return (
        intent.status === "approved" &&
        (!!intent.propagatedAt || this.canSend(intent))
      );
    } catch {
      return false;
    }
  }
  list(networkId: string): PublishedSnapshot[] {
    return this.store.db
      .prepare(
        "SELECT value,local_intent FROM published_snapshots WHERE network_id=? ORDER BY sequence",
      )
      .all(networkId)
      .filter((r) => this.allowed(r))
      .map((row) => parse(row));
  }
  get(cid: string, networkId: string): PublishedSnapshot | undefined {
    const row = this.store.db
      .prepare(
        "SELECT value,local_intent FROM published_snapshots WHERE network_id=? AND cid=?",
      )
      .get(networkId, cid);
    return row && this.allowed(row) ? parse(row) : undefined;
  }
  page(networkId: string, topicId: string, after = 0, limit = 100) {
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200
    )
      throw new Error("Invalid publication cursor or page size");
    const rows = this.store.db
      .prepare(
        "SELECT sequence,cid,value,local_intent FROM published_snapshots WHERE network_id=? AND topic_id=? AND sequence>? ORDER BY sequence LIMIT ?",
      )
      .all(networkId, topicId, after, limit);
    return {
      networkId,
      topicId,
      entries: rows
        .filter((r) => this.allowed(r))
        .map((r) => ({ sequence: Number(r.sequence), cid: String(r.cid) })),
      nextCursor: rows.length ? Number(rows.at(-1)!.sequence) : after,
      hasMore: rows.length === limit,
    };
  }
  view(networkId = this.store.networkId()): SideloreStore {
    // Eligibility is time-dependent; cached views are discarded when a pending grant expires.
    const expired = this.intents().some(
      (i) =>
        i.status === "approved" &&
        i.grantId &&
        !i.propagatedAt &&
        !this.canSend(i),
    );
    if (expired) this.close();
    if (
      this.cache?.revision === this.revision &&
      this.cache.networkId === networkId
    )
      return this.cache.store;
    this.close();
    const view = this.createView();
    try {
      view.transaction(() => {
        for (const value of this.list(networkId))
          view.importBundle(value.snapshot.bundle);
      });
    } catch (error) {
      view.close();
      throw error;
    }
    this.cache = { revision: this.revision, networkId, store: view };
    return view;
  }
  export(
    networkId = this.store.networkId(),
    options: { includeArtifactData?: boolean } = {},
  ): Bundle {
    const publications = this.list(networkId);
    const bundle = this.view(networkId).exportBundle({
      publicOnly: true,
      includeArtifactData: false,
    });
    bundle.publications = publications;
    if (options.includeArtifactData) {
      bundle.artifactData = {};
      for (const a of bundle.artifacts) {
        const bytes = this.artifactBytes(networkId, a.cid);
        if (bytes)
          bundle.artifactData[a.cid] = Buffer.from(bytes).toString("base64url");
      }
    }
    return bundle;
  }
  artifactBytes(networkId: string, cid: string): Uint8Array | undefined {
    return this.store.db
      .prepare(
        "SELECT data FROM published_artifact_data WHERE network_id=? AND cid=?",
      )
      .get(networkId, cid)?.data as Uint8Array | undefined;
  }
  cacheArtifact(networkId: string, cid: string, data: Uint8Array) {
    const approved = this.view(networkId).getPublicArtifact(cid);
    if (
      !approved ||
      cidFromBytes(data) !== cid ||
      approved.artifact.byteSize !== data.byteLength
    )
      throw new Error("Invalid or unapproved attachment");
    const bytes =
      Number(
        this.store.db
          .prepare(
            "SELECT COALESCE(SUM(byte_size),0) AS n FROM published_snapshots WHERE network_id=? AND local_intent IS NULL",
          )
          .get(networkId)?.n ?? 0,
      ) +
      Number(
        this.store.db
          .prepare(
            "SELECT COALESCE(SUM(length(data)),0) AS n FROM published_artifact_data WHERE network_id=?",
          )
          .get(networkId)?.n ?? 0,
      );
    if (bytes + data.length > this.profile(networkId).cacheBytes)
      throw new Error("Attachment cache limit reached");
    this.store.db
      .prepare(
        "INSERT OR IGNORE INTO published_artifact_data(network_id,cid,data) VALUES (?,?,?)",
      )
      .run(networkId, cid, Buffer.from(data));
  }
  restoreOffline() {
    this.store.setSetting("network_connected", false);
    this.store.setSetting("auto_connect_network", null);
    for (const profile of this.profiles())
      this.saveProfile({ ...profile, autoConnect: false });
    for (const g of this.grants())
      if (!g.revokedAt) this.revokeGrant(g.grantId);
  }
}
