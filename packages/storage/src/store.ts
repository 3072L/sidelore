import { PublicationStore } from "./publication-store.js";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  artifactSchema, canonicalize, cidFromBytes, createBundle, draftSchema, isValidIdentity, projectTrail, replicationPolicySchema,
  verifyBundle, verifyEvent, verifyFork, verifyReport, verifyReview, verifyTombstone, verifyTopicReview, verifyTrail,
  projectSubproblem, projectTopic, verifyMembershipChange, verifyNetworkPolicy, verifyResearchSubproblem, verifyResearchTopic, verifyTopicActivity, verifyTopicActivityGovernance,
  type Artifact, type Bundle, type Draft, type Event, type Fork, type Identity, type Manifest,
  type MembershipChange, type NetworkMode, type NetworkPolicy, type ReplicationPolicy, type Report,
  type ResearchSubproblem, type ResearchTopic, type ResearchTrail, type Review, type Tombstone, type TopicActivity, type TopicReview
} from "../../core/src/index.js";

export interface SearchFilters {
  query?: string; domain?: string; status?: string; visibility?: string; author?: string;
  authorType?: string; eventType?: string; reviewed?: string; since?: string; limit?: number; publicOnly?: boolean;
}
export interface TrailRecord { trail: ResearchTrail; events: Event[]; reviews: Review[]; forks: Fork[]; tombstones: Tombstone[]; }
export interface TopicRecord { topic: ResearchTopic; subproblems: ResearchSubproblem[]; activities: TopicActivity[]; reviews: TopicReview[]; trails: ResearchTrail[]; }
export interface ExportOptions { publicOnly?: boolean; policy?: ReplicationPolicy; trailIds?: string[]; topicIds?: string[]; subproblemIds?: string[]; includeArtifactData?: boolean; includeMembership?: boolean; }
export interface SideloreStoreOptions { networkMode?: NetworkMode; networkId?: string; directoryEnabled?: boolean; bridgeEnabled?: boolean; internalApprovedView?: boolean; }
type Row = Record<string, unknown>;
const read = <T>(row: Row, column: string): T => JSON.parse(String(row[column])) as T;

export class SideloreStore {
  readonly db: DatabaseSync;
  readonly nodeId: string;
  readonly publications: PublicationStore;
  private readonly internalApprovedView: boolean;
  private inTransaction = false;
  private dirty = new Set<string>();

  constructor(dbPath = ":memory:", options: SideloreStoreOptions = {}) {
    this.internalApprovedView = options.internalApprovedView === true;
    if (options.networkMode && options.networkMode !== "isolated" && options.networkMode !== "federated") throw new Error("Invalid network mode");
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ":memory:") chmodSync(dbPath, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS node_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS identities (identity_id TEXT PRIMARY KEY, identity_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trails (trail_id TEXT PRIMARY KEY, visibility TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, trail_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY, record_id TEXT NOT NULL, author_identity_id TEXT NOT NULL, content_cid TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL, event_json TEXT NOT NULL,
        FOREIGN KEY (record_id) REFERENCES trails(trail_id), FOREIGN KEY (author_identity_id) REFERENCES identities(identity_id)
      );
      CREATE INDEX IF NOT EXISTS events_record_idx ON events(record_id, created_at);
      CREATE TABLE IF NOT EXISTS artifacts (cid TEXT PRIMARY KEY, artifact_json TEXT NOT NULL, data BLOB, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS reviews (review_id TEXT PRIMARY KEY, trail_id TEXT NOT NULL, review_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS forks (fork_id TEXT PRIMARY KEY, source_trail_id TEXT NOT NULL, fork_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tombstones (tombstone_id TEXT PRIMARY KEY, target_id TEXT NOT NULL, tombstone_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tombstones_target_idx ON tombstones(target_id);
      CREATE TABLE IF NOT EXISTS drafts (draft_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, draft_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS peers (peer_id TEXT PRIMARY KEY, peer_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (report_id TEXT PRIMARY KEY, report_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open');
      CREATE TABLE IF NOT EXISTS moderation (target_id TEXT PRIMARY KEY, hidden INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS audit_log (sequence INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS topics (topic_id TEXT PRIMARY KEY, visibility TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, topic_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subproblems (subproblem_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, subproblem_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS subproblems_topic_idx ON subproblems(topic_id, updated_at);
      CREATE TABLE IF NOT EXISTS topic_activities (activity_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, subproblem_id TEXT, created_at TEXT NOT NULL, activity_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS topic_activities_topic_idx ON topic_activities(topic_id, created_at);
      CREATE TABLE IF NOT EXISTS topic_reviews (review_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, subproblem_id TEXT, review_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS topic_reviews_topic_idx ON topic_reviews(topic_id, review_id);
      CREATE TABLE IF NOT EXISTS membership_changes (change_id TEXT PRIMARY KEY, network_id TEXT NOT NULL, created_at TEXT NOT NULL, change_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS membership_network_idx ON membership_changes(network_id, created_at);
      CREATE TABLE IF NOT EXISTS network_policies (network_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, policy_json TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS trail_fts USING fts5(trail_id UNINDEXED, title, abstract, domains, tags, event_text, tokenize='unicode61');
      CREATE VIRTUAL TABLE IF NOT EXISTS public_trail_fts USING fts5(trail_id UNINDEXED, title, abstract, domains, tags, event_text, tokenize='unicode61');
    `);
    this.nodeId = this.getSetting<string>("node_id") ?? `node-${randomUUID()}`;
    this.setSetting("node_id", this.nodeId);
    if (!this.getSetting<NetworkMode>("network_mode")) this.setSetting("network_mode", options.networkMode ?? "isolated");
    if (!this.getSetting<string>("network_id")) this.setSetting("network_id", options.networkId ?? `network-${this.nodeId}`);
    if (this.getSetting("directory_enabled") === undefined) this.setSetting("directory_enabled", options.directoryEnabled ?? false);
    if (this.getSetting("bridge_enabled") === undefined) this.setSetting("bridge_enabled", options.bridgeEnabled ?? false);
    this.publications = new PublicationStore(this, () => new SideloreStore(":memory:", { internalApprovedView: true, networkId: this.networkId() }));
    // Rebuild derived public indexes when opening a database created by an earlier MVP.
    if (!this.getSetting("public_index_v2")) {
      this.transaction(() => { for (const row of this.db.prepare("SELECT trail_id FROM trails").all() as Row[]) this.changed(String(row.trail_id)); });
      this.setSetting("public_index_v2", true);
    }
  }
  close(): void { this.publications.close(); this.db.close(); }
  getSetting<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT value FROM node_meta WHERE key = ?").get(key) as Row | undefined;
    if (!row) return undefined;
    try { return JSON.parse(String(row.value)) as T; } catch { return row.value as T; }
  }
  setSetting(key: string, value: unknown): void {
    this.db.prepare("INSERT INTO node_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
  }
  networkMode(): NetworkMode { return this.getSetting<NetworkMode>("network_mode") ?? "federated"; }
  networkId(): string { return this.getSetting<string>("network_id") ?? `network-${this.nodeId}`; }
  directoryEnabled(): boolean { return Boolean(this.getSetting<boolean>("directory_enabled")); }
  bridgeEnabled(): boolean { return Boolean(this.getSetting<boolean>("bridge_enabled")); }
  canFederate(): boolean { return this.networkMode() === "federated"; }
  getNetworkPolicy(): NetworkPolicy | undefined {
    const row = this.db.prepare("SELECT policy_json FROM network_policies WHERE network_id=?").get(this.networkId()) as Row | undefined;
    return row && read<NetworkPolicy>(row, "policy_json");
  }
  saveNetworkPolicy(policy: NetworkPolicy): void {
    const identities = this.listIdentities();
    if (!verifyNetworkPolicy(policy, identities)) throw new Error("Network policy signature verification failed");
    if (!policy.approvals.some(approval => approval.identityId === policy.updatedBy)) throw new Error("Network policy updatedBy must approve the policy");
    if (policy.networkId !== this.networkId()) throw new Error("Network policy belongs to another network");
    const previous = this.getNetworkPolicy();
    if (previous && (policy.updatedAt < previous.updatedAt || new Set(policy.approvals.map(a => a.identityId)).size < previous.requiredSignatures)) throw new Error("Network policy lacks the existing threshold or is stale");
    const active = this.activeMembers(policy.networkId);
    if (!active.size) this.setSetting(`bootstrap_member:${policy.networkId}`, policy.updatedBy);
    if (active.size && !policy.approvals.every(approval => active.has(approval.identityId))) throw new Error("Network policy signer is not an active member");
    this.db.prepare("INSERT INTO network_policies(network_id,updated_at,policy_json) VALUES (?,?,?) ON CONFLICT(network_id) DO UPDATE SET updated_at=excluded.updated_at,policy_json=excluded.policy_json")
      .run(policy.networkId, policy.updatedAt, JSON.stringify(policy));
    this.setSetting("network_mode", policy.mode);
    this.setSetting("directory_enabled", policy.directoryEnabled);
    this.setSetting("bridge_enabled", policy.bridgeEnabled);
    this.audit("network_policy", { networkId: policy.networkId, mode: policy.mode, bridgeEnabled: policy.bridgeEnabled });
  }
  transaction<T>(operation: () => T): T {
    if (this.inTransaction) return operation();
    this.db.exec("BEGIN IMMEDIATE"); this.inTransaction = true;
    try {
      const result = operation();
      for (const id of this.dirty) this.refreshTrail(id);
      this.db.exec("COMMIT"); return result;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    finally { this.inTransaction = false; this.dirty.clear(); }
  }
  private changed(trailId: string): void {
    if (this.inTransaction) this.dirty.add(trailId); else this.refreshTrail(trailId);
  }
  registerIdentity(identity: Identity): void {
    if (!isValidIdentity(identity)) throw new Error("Invalid identity");
    // A public key identifies the author; imported display metadata cannot silently replace it.
    this.db.prepare("INSERT INTO identities(identity_id,identity_json) VALUES (?,?) ON CONFLICT(identity_id) DO NOTHING").run(identity.identityId, JSON.stringify(identity));
  }
  getIdentity(id: string): Identity | undefined {
    const row = this.db.prepare("SELECT identity_json FROM identities WHERE identity_id=?").get(id) as Row | undefined;
    return row && read<Identity>(row, "identity_json");
  }
  listIdentities(): Identity[] { return (this.db.prepare("SELECT identity_json FROM identities ORDER BY identity_id").all() as Row[]).map(row => read(row, "identity_json")); }
  private topicRequiresMembership(topic: ResearchTopic): boolean {
    const organization = this.publications.profiles().some(p => p.networkId === this.networkId() && p.kind === "organization") || !!this.getNetworkPolicy() || this.listMembershipChanges().length > 0;
    return !this.internalApprovedView && organization && topic.visibility === "private" && !(this.networkMode() === "federated" && this.publications.view().getTopic(topic.topicId));
  }
  saveTopic(topic: ResearchTopic): void {
    const identity = this.getIdentity(topic?.createdBy);
    if (!identity || !verifyResearchTopic(topic, identity)) throw new Error("Topic signature verification failed");
    if (topic.governancePolicy.requiredSignatures < 1) throw new Error("Topic governance requires at least one signature");
    if (this.topicRequiresMembership(topic) && !this.activeMembers(this.networkId()).size) this.setSetting(`bootstrap_member:${this.networkId()}`, topic.createdBy);
    if (this.topicRequiresMembership(topic) && this.activeMembers(this.networkId()).size && !this.activeMembers(this.networkId()).has(topic.createdBy)) throw new Error("Private topics can only be created by a network member");
    const existing = this.getTopic(topic.topicId);
    if (existing && existing.contentCid !== topic.contentCid) throw new Error(`Topic id collision: ${topic.topicId}`);
    if (!existing) this.db.prepare("INSERT INTO topics(topic_id,visibility,status,updated_at,topic_json) VALUES (?,?,?,?,?)")
      .run(topic.topicId, topic.visibility, topic.status, topic.updatedAt, JSON.stringify(topic));
  }
  getTopic(id: string): ResearchTopic | undefined {
    const row = this.db.prepare("SELECT topic_json FROM topics WHERE topic_id=?").get(id) as Row | undefined;
    return row && read<ResearchTopic>(row, "topic_json");
  }
  listTopics(options: { publicOnly?: boolean; limit?: number } = {}): ResearchTopic[] {
    if (options.publicOnly && !this.internalApprovedView) return this.publications.view().listTopics(options);
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 1000), 1), 100000);
    const rows = this.db.prepare("SELECT topic_json FROM topics ORDER BY updated_at DESC,topic_id LIMIT ?").all(limit) as Row[];
    return rows.map(row => read<ResearchTopic>(row, "topic_json"))
      .filter(topic => !options.publicOnly || ((this.internalApprovedView || topic.visibility !== "private") && topic.status !== "retired"));
  }
  searchTopics(filters: { query?: string; domain?: string; status?: string; visibility?: string; publicOnly?: boolean; limit?: number } = {}): ResearchTopic[] {
    if (filters.publicOnly && !this.internalApprovedView) return this.publications.view().searchTopics(filters);
    const query = filters.query?.trim().toLocaleLowerCase();
    return this.listTopics({ publicOnly: false, limit: filters.limit ?? 100000 }).map(topic => projectTopic(topic, this.listTopicActivities(topic.topicId).filter(activity => !filters.publicOnly || this.internalApprovedView || activity.visibility !== "private"))).filter(topic =>
      (!filters.publicOnly || ((this.internalApprovedView || topic.visibility !== "private") && (topic.derivedStatus ?? topic.status) !== "retired")) &&
      (!query || `${topic.question} ${topic.context} ${topic.domains.join(" ")} ${topic.tags.join(" ")}`.toLocaleLowerCase().includes(query))
      && (!filters.domain || topic.domains.includes(filters.domain))
      && (!filters.status || (topic.derivedStatus ?? topic.status) === filters.status)
      && (!filters.visibility || topic.visibility === filters.visibility)
    ).slice(0, Math.min(Math.max(Math.trunc(filters.limit ?? 100), 1), 100000));
  }
  saveSubproblem(subproblem: ResearchSubproblem): void {
    const identity = this.getIdentity(subproblem?.createdBy);
    if (!identity || !verifyResearchSubproblem(subproblem, identity)) throw new Error("Subproblem signature verification failed");
    const topic = this.getTopic(subproblem.topicId);
    if (!topic) throw new Error(`Unknown topic ${subproblem.topicId}`);
    if (this.topicRequiresMembership(topic) && !this.activeMembers(this.networkId()).has(subproblem.createdBy)) throw new Error("Private topic subproblems require an active member");
    const existing = this.getSubproblem(subproblem.subproblemId);
    if (existing && existing.contentCid !== subproblem.contentCid) throw new Error(`Subproblem id collision: ${subproblem.subproblemId}`);
    if (!existing) this.db.prepare("INSERT INTO subproblems(subproblem_id,topic_id,status,updated_at,subproblem_json) VALUES (?,?,?,?,?)")
      .run(subproblem.subproblemId, subproblem.topicId, subproblem.status, subproblem.updatedAt, JSON.stringify(subproblem));
  }
  getSubproblem(id: string): ResearchSubproblem | undefined {
    const row = this.db.prepare("SELECT subproblem_json FROM subproblems WHERE subproblem_id=?").get(id) as Row | undefined;
    return row && read<ResearchSubproblem>(row, "subproblem_json");
  }
  listSubproblems(topicId?: string): ResearchSubproblem[] {
    const rows = (topicId
      ? this.db.prepare("SELECT subproblem_json FROM subproblems WHERE topic_id=? ORDER BY updated_at,subproblem_id").all(topicId)
      : this.db.prepare("SELECT subproblem_json FROM subproblems ORDER BY updated_at,subproblem_id").all()) as Row[];
    return rows.map(row => read<ResearchSubproblem>(row, "subproblem_json"));
  }
  saveTopicActivity(activity: TopicActivity): void {
    const identity = this.getIdentity(activity?.authorIdentityId);
    if (!identity || !verifyTopicActivity(activity, identity)) throw new Error("Topic activity signature verification failed");
    const topic = this.getTopic(activity.topicId);
    if (!topic) throw new Error(`Unknown topic ${activity.topicId}`);
    if (this.topicRequiresMembership(topic) && !this.activeMembers(this.networkId()).has(activity.authorIdentityId)) throw new Error("Private topic activities require an active member");
    if (activity.activityType === "status_update" && !topic.maintainers.includes(activity.authorIdentityId)
      && !(topic.governancePolicy.allowedMembers ?? []).includes(activity.authorIdentityId)) throw new Error("Only topic maintainers can update topic status");
    if (activity.activityType === "status_update" && !verifyTopicActivityGovernance(activity, this.listIdentities(), topic.governancePolicy.requiredSignatures, topic.governancePolicy.allowedMembers)) throw new Error("Topic status update lacks the required governance signatures");
    if (activity.subproblemId && this.getSubproblem(activity.subproblemId)?.topicId !== activity.topicId) throw new Error("Activity subproblem belongs to another topic");
    const existing = this.db.prepare("SELECT activity_json FROM topic_activities WHERE activity_id=?").get(activity.activityId) as Row | undefined;
    if (existing && canonicalize(read<TopicActivity>(existing, "activity_json")) !== canonicalize(activity)) throw new Error("Topic activity id collision");
    if (!existing) this.db.prepare("INSERT INTO topic_activities(activity_id,topic_id,subproblem_id,created_at,activity_json) VALUES (?,?,?,?,?)")
      .run(activity.activityId, activity.topicId, activity.subproblemId ?? null, activity.createdAt, JSON.stringify(activity));
  }
  listTopicActivities(topicId?: string): TopicActivity[] {
    const rows = (topicId
      ? this.db.prepare("SELECT activity_json FROM topic_activities WHERE topic_id=? ORDER BY created_at,activity_id").all(topicId)
      : this.db.prepare("SELECT activity_json FROM topic_activities ORDER BY created_at,activity_id").all()) as Row[];
    return rows.map(row => read<TopicActivity>(row, "activity_json"));
  }
  saveTopicReview(review: TopicReview): void {
    const identity = this.getIdentity(review?.reviewerIdentityId);
    if (!identity || !verifyTopicReview(review, identity)) throw new Error("Topic review signature verification failed");
    const topic = this.getTopic(review.topicId);
    if (!topic) throw new Error(`Unknown topic ${review.topicId}`);
    if (review.subproblemId && this.getSubproblem(review.subproblemId)?.topicId !== review.topicId) throw new Error("Topic review subproblem belongs to another topic");
    if (this.topicRequiresMembership(topic) && !this.activeMembers(this.networkId()).has(review.reviewerIdentityId)) throw new Error("Private topic reviews require an active member");
    const existing = this.db.prepare("SELECT review_json FROM topic_reviews WHERE review_id=?").get(review.reviewId) as Row | undefined;
    if (existing && canonicalize(read<TopicReview>(existing, "review_json")) !== canonicalize(review)) throw new Error("Topic review id collision");
    if (!existing) this.db.prepare("INSERT INTO topic_reviews(review_id,topic_id,subproblem_id,review_json) VALUES (?,?,?,?)")
      .run(review.reviewId, review.topicId, review.subproblemId ?? null, JSON.stringify(review));
  }
  listTopicReviews(topicId?: string): TopicReview[] {
    const rows = (topicId
      ? this.db.prepare("SELECT review_json FROM topic_reviews WHERE topic_id=? ORDER BY review_id").all(topicId)
      : this.db.prepare("SELECT review_json FROM topic_reviews ORDER BY review_id").all()) as Row[];
    return rows.map(row => read<TopicReview>(row, "review_json"));
  }
  getTopicRecord(id: string, options: { publicOnly?: boolean } = {}): TopicRecord | undefined {
    if (options.publicOnly && !this.internalApprovedView) return this.publications.view().getTopicRecord(id, options);
    const source = this.getTopic(id); if (!source) return undefined;
    const activities = this.listTopicActivities(id).filter(activity => !options.publicOnly || this.internalApprovedView || activity.visibility !== "private");
    const reviews = this.listTopicReviews(id);
    return { topic: projectTopic(source, activities), subproblems: this.listSubproblems(id).map(item => projectSubproblem(item, activities)), activities, reviews, trails: this.searchTrails({ publicOnly: options.publicOnly }).filter(trail => trail.topicId === id) };
  }
  saveDraft(draft: Draft): Draft {
    draftSchema.parse(draft);
    if (draft.published) throw new Error("A published draft cannot be edited");
    const existing = this.getDraft(draft.draftId);
    if (existing && existing.ownerIdentityId !== draft.ownerIdentityId) throw new Error("Draft owner mismatch");
    this.db.prepare("INSERT INTO drafts(draft_id,updated_at,draft_json) VALUES (?,?,?) ON CONFLICT(draft_id) DO UPDATE SET updated_at=excluded.updated_at,draft_json=excluded.draft_json")
      .run(draft.draftId, draft.updatedAt, JSON.stringify(draft));
    return draft;
  }
  getDraft(id: string): Draft | undefined {
    const row = this.db.prepare("SELECT draft_json FROM drafts WHERE draft_id=?").get(id) as Row | undefined;
    return row && read(row, "draft_json");
  }
  listDrafts(): Draft[] { return (this.db.prepare("SELECT draft_json FROM drafts ORDER BY updated_at DESC").all() as Row[]).map(row => read(row, "draft_json")); }
  deleteDraft(id: string): void { this.db.prepare("DELETE FROM drafts WHERE draft_id=?").run(id); }
  saveTrail(trail: ResearchTrail): void {
    const identity = this.getIdentity(trail?.provenance?.authorIdentityId);
    if (!identity || !verifyTrail(trail, identity)) throw new Error("Trail signature verification failed");
    if (trail.topicId && !this.getTopic(trail.topicId)) throw new Error(`Unknown topic ${trail.topicId}`);
    if (trail.subproblemId && this.getSubproblem(trail.subproblemId)?.topicId !== trail.topicId) throw new Error(`Unknown subproblem ${trail.subproblemId}`);
    const existing = this.getTrail(trail.trailId);
    if (existing && existing.contentCid !== trail.contentCid) throw new Error(`Trail id collision: ${trail.trailId}`);
    if (!existing) {
      const clean = projectTrail(trail, []);
      clean.provenance.authorType = identity.agentOrHuman;
      clean.provenance.recordedBy = identity.displayName;
      this.db.prepare("INSERT INTO trails(trail_id,visibility,status,updated_at,trail_json) VALUES (?,?,?,?,?)")
        .run(clean.trailId, clean.visibility, clean.status, clean.provenance.updatedAt, JSON.stringify(clean));
    }
    this.changed(trail.trailId);
  }
  appendEvent(event: Event): Event {
    const identity = this.getIdentity(event?.authorIdentityId);
    if (!identity || !verifyEvent(event, identity)) throw new Error("Event signature verification failed");
    const trail = this.getTrail(event.recordId);
    if (!trail) throw new Error(`Unknown trail ${event.recordId}`);
    const existing = this.getEvent(event.eventId);
    if (existing) {
      if (canonicalize(existing) !== canonicalize(event)) throw new Error("Event id collision");
      return existing;
    }
    for (const id of event.parentEventIds) {
      const parent = this.getEvent(id);
      if (!parent) throw new Error(`Unknown parent event ${id}`);
      if (parent.recordId !== event.recordId) throw new Error("Parent belongs to a different trail; use a fork or citation");
      if (!this.internalApprovedView && event.visibility !== "private" && parent.visibility === "private") throw new Error("A public event cannot depend on a private parent");
    }
    this.db.prepare("INSERT INTO events(event_id,record_id,author_identity_id,content_cid,created_at,event_json) VALUES (?,?,?,?,?,?)")
      .run(event.eventId, event.recordId, event.authorIdentityId, event.contentCid, event.createdAt, JSON.stringify(event));
    this.changed(trail.trailId);
    return event;
  }
  publish(trail: ResearchTrail, events: Event[] = []): TrailRecord {
    this.transaction(() => {
      if (events.some(event => event.recordId !== trail.trailId)) throw new Error("Event belongs to a different trail");
      this.saveTrail(trail); this.appendGraph(events);
    });
    return this.getTrailRecord(trail.trailId)!;
  }
  private appendGraph(events: Event[]): void {
    const pending = new Map(events.map(event => [event.eventId, event]));
    while (pending.size) {
      const before = pending.size;
      for (const [id, event] of pending) if (event.parentEventIds.every(parent => this.getEvent(parent))) {
        this.appendEvent(event); pending.delete(id);
      }
      if (pending.size === before) throw new Error("Event graph contains missing parents or a cycle");
    }
  }
  getTrail(id: string): ResearchTrail | undefined {
    const row = this.db.prepare("SELECT trail_json FROM trails WHERE trail_id=?").get(id) as Row | undefined;
    return row && read(row, "trail_json");
  }
  getEvent(id: string): Event | undefined {
    const row = this.db.prepare("SELECT event_json FROM events WHERE event_id=? OR content_cid=?").get(id, id) as Row | undefined;
    return row && read(row, "event_json");
  }
  private trailEvents(id: string): Event[] {
    return (this.db.prepare("SELECT event_json FROM events WHERE record_id=? ORDER BY created_at,event_id").all(id) as Row[]).map(row => read(row, "event_json"));
  }
  getTrailRecord(id: string): TrailRecord | undefined {
    const trail = this.getTrail(id); if (!trail) return undefined;
    const events = this.trailEvents(id);
    const reviews = (this.db.prepare("SELECT review_json FROM reviews WHERE trail_id=? ORDER BY review_id").all(id) as Row[]).map(row => read<Review>(row, "review_json"));
    const forks = (this.db.prepare("SELECT fork_json FROM forks WHERE source_trail_id=? ORDER BY fork_id").all(id) as Row[]).map(row => read<Fork>(row, "fork_json"));
    const targets = new Set([id, ...events.map(event => event.eventId), ...events.flatMap(event => event.artifactRefs.map(ref => ref.cid))]);
    const tombstones = this.listTombstones().filter(item => targets.has(item.targetId));
    return { trail: { ...trail, derivedVerificationState: this.deriveVerificationState(trail, reviews) }, events, reviews, forks, tombstones };
  }
  private withdrawn(type: Tombstone["targetType"], id: string, owner: string): boolean {
    return (this.db.prepare("SELECT tombstone_json FROM tombstones WHERE target_id=?").all(id) as Row[])
      .some(row => { const item = read<Tombstone>(row, "tombstone_json"); return item.targetType === type && item.requestedBy === owner; });
  }
  private hidden(id: string): boolean { return Boolean((this.db.prepare("SELECT hidden FROM moderation WHERE target_id=?").get(id) as Row | undefined)?.hidden); }
  private visibleEvents(events: Event[]): Event[] {
    const pending = new Map(events.filter(event => (this.internalApprovedView || event.visibility !== "private") && !this.hidden(event.eventId)
      && !this.withdrawn("event", event.eventId, event.authorIdentityId)).map(event => [event.eventId, event]));
    const accepted = new Map<string, Event>();
    while (pending.size) {
      const before = pending.size;
      for (const [id, event] of pending) if (event.parentEventIds.every(parent => accepted.has(parent))) { accepted.set(id, event); pending.delete(id); }
      if (before === pending.size) break;
    }
    return [...accepted.values()];
  }
  getPublicTrailRecord(id: string): TrailRecord | undefined {
    if (!this.internalApprovedView) return this.publications.view().getPublicTrailRecord(id);
    const record = this.getTrailRecord(id);
    if (!record || (!this.internalApprovedView && record.trail.visibility === "private") || record.trail.status === "retracted" || this.hidden(id)) return undefined;
    const events = this.visibleEvents(record.events);
    const trail = projectTrail(record.trail, events);
    if (trail.status === "draft" || trail.status === "retracted") return undefined;
    const visible = new Set(events.map(event => event.eventId));
    const reviews = record.reviews.filter(review => !review.eventId || visible.has(review.eventId));
    trail.reviewSummary = this.summarizeReviews(reviews);
    trail.derivedVerificationState = this.deriveVerificationState(trail, reviews);
    return { trail, events, reviews, forks: record.forks.filter(fork => visible.has(fork.sourceEventId) && this.isPublicTrail(fork.newTrailId)), tombstones: [] };
  }
  private isPublicTrail(id: string): boolean {
    const trail = this.getTrail(id);
    return !!trail && (this.internalApprovedView || trail.visibility !== "private") && trail.status !== "draft" && trail.status !== "retracted" && !this.hidden(id);
  }
  getPublicEvent(id: string): Event | undefined {
    if (!this.internalApprovedView) return this.publications.view().getPublicEvent(id);
    const event = this.getEvent(id);
    return event && this.getPublicTrailRecord(event.recordId)?.events.find(item => item.eventId === event.eventId);
  }
  searchTrails(filters: SearchFilters = {}): ResearchTrail[] {
    if (filters.publicOnly && !this.internalApprovedView) return this.publications.view().searchTrails(filters);
    const limit = Number.isFinite(filters.limit) ? Math.min(Math.max(Math.trunc(filters.limit!), 1), 100000) : 100;
    const publicOnly = filters.publicOnly === true;
    const table = publicOnly ? "public_trail_fts" : "trail_fts";
    const args: SQLInputValue[] = [], clauses: string[] = [];
    let join = "";
    if (filters.query?.trim()) {
      const terms = filters.query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 30) ?? [];
      if (!terms.length) return [];
      join = ` JOIN ${table} ON ${table}.trail_id=t.trail_id`;
      clauses.push(`${table} MATCH ?`); args.push(terms.map(term => `"${term}"*`).join(" AND "));
    }
    if (filters.publicOnly) clauses.push("t.trail_id IN (SELECT trail_id FROM public_trail_fts)");
    for (const [column, value] of [["t.status", filters.status], ["t.visibility", filters.visibility], ["json_extract(t.trail_json,'$.provenance.authorIdentityId')", filters.author], ["json_extract(t.trail_json,'$.provenance.authorType')", filters.authorType]] as const) {
      // A private event can change the full projection's status. Public queries
      // apply status against the public projection below instead of leaking it
      // through the full trail row.
      if (publicOnly && column === "t.status") continue;
      if (value) { clauses.push(`${column}=?`); args.push(value); }
    }
    if (filters.domain) { clauses.push("EXISTS (SELECT 1 FROM json_each(t.trail_json,'$.domains') WHERE value=?)"); args.push(filters.domain); }
    if (filters.since && !publicOnly) { clauses.push("t.updated_at>=?"); args.push(filters.since); }
    if (filters.eventType && !publicOnly) {
      clauses.push("EXISTS (SELECT 1 FROM events e WHERE e.record_id=t.trail_id AND json_extract(e.event_json,'$.eventType')=? AND json_extract(e.event_json,'$.visibility')!='private')"); args.push(filters.eventType);
    }
    if (filters.reviewed && !publicOnly) { clauses.push("EXISTS (SELECT 1 FROM reviews r WHERE r.trail_id=t.trail_id AND json_extract(r.review_json,'$.status')=?)"); args.push(filters.reviewed); }
    // Public filters are evaluated after projection. Fetching the bounded local
    // index first keeps status, event, and review filters from exposing private
    // branches or from being applied to the wrong derived view.
    args.push(publicOnly ? 100000 : limit);
    const rows = this.db.prepare(`SELECT t.trail_json FROM trails t${join}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY t.updated_at DESC,t.trail_id LIMIT ?`).all(...args) as Row[];
    const source = rows.map(row => read<ResearchTrail>(row, "trail_json"));
    if (!publicOnly) return source;
    return source.map(trail => this.getPublicTrailRecord(trail.trailId)).filter((record): record is TrailRecord => !!record)
      .filter(record => (!filters.status || record.trail.status === filters.status)
        && (!filters.visibility || record.trail.visibility === filters.visibility)
        && (!filters.author || record.trail.provenance.authorIdentityId === filters.author)
        && (!filters.authorType || record.trail.provenance.authorType === filters.authorType)
        && (!filters.domain || record.trail.domains.includes(filters.domain))
        && (!filters.since || record.trail.provenance.updatedAt >= filters.since)
        && (!filters.eventType || record.events.some(event => event.eventType === filters.eventType))
        && (!filters.reviewed || record.reviews.some(review => review.status === filters.reviewed)))
      .slice(0, limit).map(record => record.trail);
  }
  saveReview(review: Review): void {
    const identity = this.getIdentity(review?.reviewerIdentityId);
    if (!identity || !verifyReview(review, identity)) throw new Error("Review signature verification failed");
    if (!this.getTrail(review.trailId)) throw new Error("Unknown review trail");
    if (review.eventId && this.getEvent(review.eventId)?.recordId !== review.trailId) throw new Error("Review event belongs to a different trail");
    const existing = this.db.prepare("SELECT review_json FROM reviews WHERE review_id=?").get(review.reviewId) as Row | undefined;
    if (existing && canonicalize(read<Review>(existing, "review_json")) !== canonicalize(review)) throw new Error("Review id collision");
    if (!existing) this.db.prepare("INSERT INTO reviews(review_id,trail_id,review_json) VALUES (?,?,?)").run(review.reviewId, review.trailId, JSON.stringify(review));
    this.changed(review.trailId);
  }
  saveFork(fork: Fork): void {
    const identity = this.getIdentity(fork?.authorIdentityId);
    if (!identity || !verifyFork(fork, identity)) throw new Error("Fork signature verification failed");
    if (this.getEvent(fork.sourceEventId)?.recordId !== fork.sourceTrailId) throw new Error("Unknown fork source event");
    if (this.getTrail(fork.newTrailId)?.provenance.authorIdentityId !== fork.authorIdentityId) throw new Error("Fork author must own the new trail");
    if (fork.newTrailId === fork.sourceTrailId) throw new Error("Fork must create a separate trail");
    const existing = this.db.prepare("SELECT fork_json FROM forks WHERE fork_id=?").get(fork.forkId) as Row | undefined;
    if (existing && canonicalize(read<Fork>(existing, "fork_json")) !== canonicalize(fork)) throw new Error("Fork id collision");
    if (!existing) this.db.prepare("INSERT INTO forks(fork_id,source_trail_id,fork_json) VALUES (?,?,?)").run(fork.forkId, fork.sourceTrailId, JSON.stringify(fork));
  }
  private targetOwner(type: Tombstone["targetType"], id: string): string | undefined {
    if (type === "trail") return this.getTrail(id)?.provenance.authorIdentityId;
    if (type === "event") return this.getEvent(id)?.authorIdentityId;
    const artifact = this.getArtifact(id)?.artifact;
    return artifact?.sourceEventId ? this.getEvent(artifact.sourceEventId)?.authorIdentityId : undefined;
  }
  listTombstones(): Tombstone[] { return (this.db.prepare("SELECT tombstone_json FROM tombstones ORDER BY tombstone_id").all() as Row[]).map(row => read(row, "tombstone_json")); }
  saveTombstone(tombstone: Tombstone): void {
    const identity = this.getIdentity(tombstone?.requestedBy);
    if (!identity || !verifyTombstone(tombstone, identity)) throw new Error("Tombstone signature verification failed");
    const owner = this.targetOwner(tombstone.targetType, tombstone.targetId);
    if (owner && owner !== tombstone.requestedBy) throw new Error("Only the target author can withdraw content; submit a report for operator moderation");
    // Unknown targets are retained as pending claims, never applied without matching ownership.
    const existing = this.db.prepare("SELECT tombstone_json FROM tombstones WHERE tombstone_id=?").get(tombstone.tombstoneId) as Row | undefined;
    if (existing && canonicalize(read<Tombstone>(existing, "tombstone_json")) !== canonicalize(tombstone)) throw new Error("Tombstone id collision");
    if (!existing) this.db.prepare("INSERT INTO tombstones(tombstone_id,target_id,tombstone_json) VALUES (?,?,?)").run(tombstone.tombstoneId, tombstone.targetId, JSON.stringify(tombstone));
    if (tombstone.targetType === "trail" && owner) this.changed(tombstone.targetId);
    if (tombstone.targetType === "event" && owner) this.changed(this.getEvent(tombstone.targetId)!.recordId);
    if (tombstone.targetType === "artifact" && owner) this.db.prepare("UPDATE artifacts SET revoked=1 WHERE cid=?").run(tombstone.targetId);
  }
  saveArtifact(artifact: Artifact, data?: Uint8Array): void {
    artifactSchema.parse(artifact);
    if (artifact.retentionPolicy === "expires" && !artifact.expiresAt) throw new Error("Expiring artifacts require expiresAt");
    if (data && (cidFromBytes(data) !== artifact.cid || artifact.checksum !== artifact.cid || artifact.byteSize !== data.byteLength)) throw new Error("Artifact CID, checksum, or size mismatch");
    if (artifact.sourceEventId) {
      const source = this.getEvent(artifact.sourceEventId);
      const ref = source?.artifactRefs.find(item => item.cid === artifact.cid);
      if (!ref) throw new Error("Artifact must be referenced by its signed source event");
      if ((ref.byteSize !== undefined && ref.byteSize !== artifact.byteSize) || (ref.encryptionMode && ref.encryptionMode !== artifact.encryptionMode)) throw new Error("Artifact metadata differs from signed reference");
    }
    const existing = this.getArtifact(artifact.cid);
    if (existing && canonicalize(existing.artifact) !== canonicalize(artifact)) throw new Error("Artifact metadata collision");
    const owner = this.targetOwner("event", artifact.sourceEventId ?? "");
    const revoked = owner && this.withdrawn("artifact", artifact.cid, owner) ? 1 : 0;
    this.db.prepare("INSERT INTO artifacts(cid,artifact_json,data,revoked) VALUES (?,?,?,?) ON CONFLICT(cid) DO UPDATE SET data=COALESCE(artifacts.data,excluded.data),revoked=MAX(artifacts.revoked,excluded.revoked)")
      .run(artifact.cid, JSON.stringify(artifact), data ? Buffer.from(data) : null, revoked);
  }
  getArtifact(cid: string): { artifact: Artifact; data?: Uint8Array; revoked: boolean } | undefined {
    const row = this.db.prepare("SELECT artifact_json,data,revoked FROM artifacts WHERE cid=?").get(cid) as Row | undefined;
    return row && { artifact: read(row, "artifact_json"), data: row.data == null ? undefined : row.data as Uint8Array, revoked: Boolean(row.revoked) };
  }
  getPublicArtifact(cid: string): ReturnType<SideloreStore["getArtifact"]> {
    if (!this.internalApprovedView) {
      const approved = this.publications.view().getPublicArtifact(cid);
      return approved ? { ...approved, data: this.publications.artifactBytes(this.networkId(), cid) } : undefined;
    }
    const saved = this.getArtifact(cid);
    if (!saved || saved.revoked || this.hidden(cid) || saved.artifact.retentionPolicy === "local_only") return undefined;
    if (saved.artifact.expiresAt && saved.artifact.expiresAt <= new Date().toISOString()) return undefined;
    if (!saved.artifact.sourceEventId || !this.getPublicEvent(saved.artifact.sourceEventId)) return undefined;
    return saved;
  }
  savePeer(peerId: string, peer: Record<string, unknown>): void {
    this.db.prepare("INSERT INTO peers(peer_id,peer_json) VALUES (?,?) ON CONFLICT(peer_id) DO UPDATE SET peer_json=excluded.peer_json").run(peerId, JSON.stringify(peer));
  }
  listPeers(): Array<Record<string, unknown>> { return (this.db.prepare("SELECT peer_json FROM peers ORDER BY peer_id").all() as Row[]).map(row => read(row, "peer_json")); }
  private activeMembers(networkId: string): Set<string> {
    const active = new Set<string>();
    const bootstrap = this.getSetting<string>(`bootstrap_member:${networkId}`);
    if (bootstrap) active.add(bootstrap);
    const rows = this.db.prepare("SELECT change_json FROM membership_changes WHERE network_id=? ORDER BY created_at,change_id").all(networkId) as Row[];
    for (const row of rows) {
      const change = read<MembershipChange>(row, "change_json");
      if (change.action === "grant") active.add(change.memberIdentityId); else active.delete(change.memberIdentityId);
    }
    return active;
  }
  saveMembershipChange(change: MembershipChange): void {
    const identities = this.listIdentities();
    if (!verifyMembershipChange(change, identities)) throw new Error("Membership change signature verification failed");
    if (change.networkId !== this.networkId()) throw new Error("Membership change belongs to another network");
    const active = this.activeMembers(change.networkId);
    if (!active.size && change.action !== "grant") throw new Error("The first membership decision must grant a member");
    if (!active.size && change.approvals[0]) this.setSetting(`bootstrap_member:${change.networkId}`, change.approvals[0].identityId);
    if (active.size && change.approvals.some(approval => !active.has(approval.identityId))) throw new Error("Membership signer is not an active member");
    if (change.action === "revoke" && active.size && !active.has(change.memberIdentityId)) throw new Error("Cannot revoke a non-member");
    const existing = this.db.prepare("SELECT change_json FROM membership_changes WHERE change_id=?").get(change.changeId) as Row | undefined;
    if (existing && canonicalize(read<MembershipChange>(existing, "change_json")) !== canonicalize(change)) throw new Error("Membership change id collision");
    if (!existing) this.db.prepare("INSERT INTO membership_changes(change_id,network_id,created_at,change_json) VALUES (?,?,?,?)")
      .run(change.changeId, change.networkId, change.createdAt, JSON.stringify(change));
    this.audit("membership_change", { changeId: change.changeId, action: change.action, memberIdentityId: change.memberIdentityId });
  }
  listMembershipChanges(networkId = this.networkId()): MembershipChange[] {
    return (this.db.prepare("SELECT change_json FROM membership_changes WHERE network_id=? ORDER BY created_at,change_id").all(networkId) as Row[]).map(row => read(row, "change_json"));
  }
  listMembers(networkId = this.networkId()): string[] { return [...this.activeMembers(networkId)].sort(); }
  private publicTombstones(): Tombstone[] {
    return this.listTombstones().filter(item => {
      const owner = this.targetOwner(item.targetType, item.targetId);
      if (!owner) return false;
      if (owner !== item.requestedBy) return false;
      if (item.targetType === "trail") return this.getTrail(item.targetId)?.visibility !== "private";
      const event = item.targetType === "event" ? this.getEvent(item.targetId) : this.getEvent(this.getArtifact(item.targetId)?.artifact.sourceEventId ?? "");
      return !!event && event.visibility !== "private" && this.getTrail(event.recordId)?.visibility !== "private";
    });
  }
  manifest(policy?: ReplicationPolicy): Manifest {
    const bundle = this.exportBundle({ publicOnly: true, policy, includeArtifactData: false });
    const manifest: Manifest = { nodeId: this.nodeId, generatedAt: new Date().toISOString(),
      trails: bundle.trails.map(trail => ({ trailId: trail.trailId, updatedAt: trail.provenance.updatedAt, status: trail.status, visibility: trail.visibility })),
      events: bundle.events.map(event => event.contentCid).sort(), artifacts: bundle.artifacts.map(item => item.cid).sort(),
      tombstones: bundle.tombstones.map(item => item.tombstoneId), reviews: bundle.reviews.map(item => item.reviewId), forks: bundle.forks.map(item => item.forkId) };
    if (bundle.topics?.length) manifest.topics = bundle.topics.map(topic => { const view = projectTopic(topic, (bundle.topicActivities ?? []).filter(activity => activity.topicId === topic.topicId)); return { topicId: topic.topicId, updatedAt: topic.updatedAt, status: view.derivedStatus ?? topic.status, visibility: topic.visibility }; });
    if (bundle.subproblems?.length) manifest.subproblems = bundle.subproblems.map(item => item.subproblemId);
    if (bundle.topicActivities?.length) manifest.topicActivities = bundle.topicActivities.map(item => item.contentCid);
    if (bundle.topicReviews?.length) manifest.topicReviews = bundle.topicReviews.map(item => item.reviewId);
    return manifest;
  }
  exportBundle(options: ExportOptions = {}): Bundle {
    if (options.publicOnly && !this.internalApprovedView) return this.publications.export(this.networkId(), { includeArtifactData: options.includeArtifactData && options.policy?.artifacts !== "none" });
    const policy = replicationPolicySchema.parse(options.policy ?? {});
    const records = this.searchTrails({ publicOnly: options.publicOnly, limit: 100000 }).filter(trail =>
      (!options.trailIds || options.trailIds.includes(trail.trailId)) &&
      (!policy.domains?.length || trail.domains.some(domain => policy.domains!.includes(domain))) &&
      (!policy.authors?.length || policy.authors.includes(trail.provenance.authorIdentityId)) && (!policy.since || trail.provenance.updatedAt >= policy.since)
    ).map(trail => options.publicOnly ? this.getPublicTrailRecord(trail.trailId)! : this.getTrailRecord(trail.trailId)!);
    const trails = records.map(record => record.trail), events = records.flatMap(record => record.events);
    const eventIds = new Set(events.map(event => event.eventId)), trailIds = new Set(trails.map(trail => trail.trailId));
    const artifacts = (this.db.prepare("SELECT artifact_json FROM artifacts ORDER BY cid").all() as Row[]).map(row => read<Artifact>(row, "artifact_json"))
      .filter(artifact => !options.publicOnly || (eventIds.has(artifact.sourceEventId ?? "") && !!this.getPublicArtifact(artifact.cid)));
    const artifactData: Record<string, string> = {};
    for (const artifact of artifacts) {
      const allowed = !options.publicOnly || ((policy.artifacts ?? "none") !== "none"
        && (!policy.maxArtifactBytes || artifact.byteSize <= policy.maxArtifactBytes)
        && (!policy.mediaTypes?.length || policy.mediaTypes.includes(artifact.mediaType))
        && (policy.artifacts !== "public" || artifact.encryptionMode === "none")
        && (policy.artifacts !== "encrypted" || artifact.encryptionMode !== "none"));
      if (allowed && options.includeArtifactData !== false) {
        const bytes = this.getArtifact(artifact.cid)?.data;
        if (bytes) artifactData[artifact.cid] = Buffer.from(bytes).toString("base64url");
      }
    }
    const reviews = records.flatMap(record => record.reviews);
    const forks = records.flatMap(record => record.forks).filter(fork => !options.publicOnly || trailIds.has(fork.newTrailId));
    const tombstones = options.publicOnly ? this.publicTombstones() : this.listTombstones();
    const selectedTopicIds = new Set(options.topicIds ?? []);
    if (options.trailIds) for (const trail of trails) if (trail.topicId) selectedTopicIds.add(trail.topicId);
    const topics = this.listTopics({ publicOnly: options.publicOnly, limit: 100000 }).filter(topic => !selectedTopicIds.size || selectedTopicIds.has(topic.topicId))
      .filter(topic => !options.publicOnly || (projectTopic(topic, this.listTopicActivities(topic.topicId).filter(activity => activity.visibility !== "private")).derivedStatus ?? topic.status) !== "retired");
    const topicIds = new Set(topics.map(topic => topic.topicId));
    const selectedSubproblemIds = new Set(options.subproblemIds ?? []);
    const subproblems = this.listSubproblems().filter(item => topicIds.has(item.topicId) && (!selectedSubproblemIds.size || selectedSubproblemIds.has(item.subproblemId)));
    const subproblemIds = new Set(subproblems.map(item => item.subproblemId));
    const topicActivities = this.listTopicActivities().filter(activity => topicIds.has(activity.topicId)
      && (!options.publicOnly || this.internalApprovedView || activity.visibility !== "private")
      && (!activity.subproblemId || subproblemIds.has(activity.subproblemId)));
    const topicReviews = this.listTopicReviews().filter(review => topicIds.has(review.topicId) && (!review.subproblemId || subproblemIds.has(review.subproblemId)));
    const includeMembership = options.includeMembership ?? !options.publicOnly;
    const membershipChanges = options.publicOnly || !includeMembership ? [] : this.listMembershipChanges();
    const networkPolicy = options.publicOnly || !includeMembership ? undefined : this.getNetworkPolicy();
    const identityIds = new Set([
      ...trails.map(trail => trail.provenance.authorIdentityId), ...events.map(event => event.authorIdentityId), ...reviews.map(review => review.reviewerIdentityId),
      ...forks.map(fork => fork.authorIdentityId), ...tombstones.map(item => item.requestedBy), ...topics.map(topic => topic.createdBy),
      ...subproblems.map(item => item.createdBy), ...topicActivities.map(item => item.authorIdentityId),
      ...topicReviews.map(item => item.reviewerIdentityId),
      ...membershipChanges.flatMap(change => change.approvals.map(approval => approval.identityId)),
      ...(networkPolicy ? [networkPolicy.updatedBy, ...networkPolicy.approvals.map(approval => approval.identityId)] : [])
    ]);
    const identities = this.listIdentities().filter(identity => !options.publicOnly || identityIds.has(identity.identityId));
    return createBundle({ identities, trails, events, artifacts, reviews, forks, tombstones, artifactData,
      topics, subproblems, topicActivities, topicReviews, membershipChanges, ...(networkPolicy ? { networkPolicy } : {}), ...(!options.publicOnly ? { drafts: this.listDrafts() } : {}) });
  }
  exportContent(options: { eventCids?: string[]; artifactCids?: string[]; trailIds?: string[]; topicIds?: string[]; subproblemIds?: string[]; policy?: ReplicationPolicy; includeArtifactData?: boolean } = {}): Bundle {
    if (!this.internalApprovedView) {
      const bundle = this.publications.export(this.networkId(), options);
      // v2 snapshots are the exchange unit. Never strip a dependency out of an approved snapshot.
      return bundle;
    }
    const requestedEvents = new Set(options.eventCids ?? []);
    const requestedArtifacts = new Set(options.artifactCids ?? []);
    const requestedTrails = new Set(options.trailIds ?? []);
    const requestedTopics = new Set(options.topicIds ?? []);
    const requestedSubproblems = new Set(options.subproblemIds ?? []);
    const all = this.exportBundle({
      publicOnly: true,
      policy: { ...(options.policy ?? {}), artifacts: options.includeArtifactData ? "all" : (options.policy?.artifacts ?? "none") },
      includeArtifactData: options.includeArtifactData ?? false
    });
    if (!requestedEvents.size && !requestedArtifacts.size && !requestedTrails.size && !requestedTopics.size && !requestedSubproblems.size) return all;
    const selectedTrailIds = new Set(requestedTrails);
    for (const trail of all.trails) if (trail.topicId && requestedTopics.has(trail.topicId)) selectedTrailIds.add(trail.trailId);
    for (const trail of all.trails) if (trail.subproblemId && requestedSubproblems.has(trail.subproblemId)) selectedTrailIds.add(trail.trailId);
    for (const event of all.events) if (requestedEvents.has(event.eventId) || requestedEvents.has(event.contentCid)) selectedTrailIds.add(event.recordId);
    for (const artifact of all.artifacts) if (requestedArtifacts.has(artifact.cid) && artifact.sourceEventId) {
      const source = all.events.find(event => event.eventId === artifact.sourceEventId);
      if (source) selectedTrailIds.add(source.recordId);
    }
    const trails = all.trails.filter(trail => selectedTrailIds.has(trail.trailId));
    const trailIds = new Set(trails.map(trail => trail.trailId));
    const events = all.events.filter(event => trailIds.has(event.recordId));
    const eventIds = new Set(events.map(event => event.eventId));
    const referencedArtifacts = new Set(events.flatMap(event => event.artifactRefs.map(ref => ref.cid)));
    const artifacts = all.artifacts.filter(artifact => (requestedArtifacts.size ? requestedArtifacts.has(artifact.cid) : referencedArtifacts.has(artifact.cid)));
    const artifactIds = new Set(artifacts.map(artifact => artifact.cid));
    const artifactData = Object.fromEntries(Object.entries(all.artifactData ?? {}).filter(([cid]) => artifactIds.has(cid)));
    const reviews = all.reviews.filter(review => trailIds.has(review.trailId));
    const forks = all.forks.filter(fork => trailIds.has(fork.sourceTrailId) && trailIds.has(fork.newTrailId));
    const tombstones = all.tombstones.filter(item => (item.targetType === "trail" && trailIds.has(item.targetId))
      || (item.targetType === "event" && eventIds.has(item.targetId))
      || (item.targetType === "artifact" && artifactIds.has(item.targetId)));
    const identityIds = new Set([...trails.map(trail => trail.provenance.authorIdentityId), ...events.map(event => event.authorIdentityId), ...reviews.map(review => review.reviewerIdentityId), ...forks.map(fork => fork.authorIdentityId), ...tombstones.map(item => item.requestedBy)]);
    const identities = all.identities.filter(identity => identityIds.has(identity.identityId));
    const topicIds = new Set([...requestedTopics, ...trails.flatMap(trail => trail.topicId ? [trail.topicId] : [])]);
    const subproblemIds = new Set([...requestedSubproblems, ...trails.flatMap(trail => trail.subproblemId ? [trail.subproblemId] : [])]);
    const topics = (all.topics ?? []).filter(topic => topicIds.has(topic.topicId));
    const subproblems = (all.subproblems ?? []).filter(item => topicIds.has(item.topicId) && subproblemIds.has(item.subproblemId));
    const topicActivities = (all.topicActivities ?? []).filter(activity => topicIds.has(activity.topicId) && (!activity.subproblemId || subproblemIds.has(activity.subproblemId)));
    const topicReviews = (all.topicReviews ?? []).filter(review => topicIds.has(review.topicId) && (!review.subproblemId || subproblemIds.has(review.subproblemId)));
    const topicIdentities = new Set([...topics.map(topic => topic.createdBy), ...subproblems.map(item => item.createdBy), ...topicActivities.map(item => item.authorIdentityId), ...topicReviews.map(item => item.reviewerIdentityId)]);
    const selectedIdentities = all.identities.filter(identity => identityIds.has(identity.identityId) || topicIdentities.has(identity.identityId));
    return createBundle({ identities: selectedIdentities, trails, events, artifacts, reviews, forks, tombstones, artifactData, topics, subproblems, topicActivities, topicReviews });
  }
  importBundle(bundle: Bundle, options: { publicOnly?: boolean } = {}): { importedTrails: number; importedEvents: number } {
    if (options.publicOnly && !this.internalApprovedView) {
      if (!bundle.publications?.length) throw new Error("Publication authorization required: legacy bundles may only be imported locally");
      let importedTrails = 0, importedEvents = 0;
      this.transaction(() => {
        for (const publication of bundle.publications!) if (this.publications.accept(publication, this.networkId())) {
          importedTrails += publication.snapshot.bundle.trails.length; importedEvents += publication.snapshot.bundle.events.length;
        }
      });
      return { importedTrails, importedEvents };
    }
    const verification = verifyBundle(bundle);
    if (!verification.valid) throw new Error(`Bundle verification failed: ${verification.errors.join("; ")}`);
    if (options.publicOnly && (bundle.drafts?.length || bundle.trails.some(trail => trail.visibility === "private") || bundle.events.some(event => event.visibility === "private")
      || (bundle.topics ?? []).some(topic => topic.visibility === "private") || (bundle.topicActivities ?? []).some(activity => activity.visibility === "private"))) throw new Error("Public sync bundle contains private data");
    let importedTrails = 0, importedEvents = 0;
    this.transaction(() => {
      for (const identity of bundle.identities) this.registerIdentity(identity);
      if (!options.publicOnly && !this.getNetworkPolicy() && !this.listMembershipChanges().length) {
        const bundleNetworkId = bundle.networkPolicy?.networkId ?? bundle.membershipChanges?.[0]?.networkId;
        if (bundleNetworkId) this.setSetting("network_id", bundleNetworkId);
      }
      for (const topic of bundle.topics ?? []) this.saveTopic(topic);
      for (const subproblem of bundle.subproblems ?? []) this.saveSubproblem(subproblem);
      for (const trail of bundle.trails) { if (!this.getTrail(trail.trailId)) importedTrails++; this.saveTrail(trail); }
      for (const event of bundle.events) if (!this.getEvent(event.eventId)) importedEvents++;
      this.appendGraph(bundle.events);
      for (const artifact of bundle.artifacts) this.saveArtifact(artifact, bundle.artifactData?.[artifact.cid] !== undefined ? Buffer.from(bundle.artifactData[artifact.cid], "base64url") : undefined);
      for (const review of bundle.reviews) this.saveReview(review);
      for (const fork of bundle.forks) this.saveFork(fork);
      for (const tombstone of bundle.tombstones) this.saveTombstone(tombstone);
      if (!options.publicOnly && !this.internalApprovedView) {
        for (const change of [...(bundle.membershipChanges ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.changeId.localeCompare(b.changeId))) this.saveMembershipChange(change);
        if (bundle.networkPolicy) this.saveNetworkPolicy(bundle.networkPolicy);
        if (bundle.networkPolicy || bundle.membershipChanges?.length) this.publications.restoreOffline();
      }
      for (const activity of bundle.topicActivities ?? []) this.saveTopicActivity(activity);
      for (const review of bundle.topicReviews ?? []) this.saveTopicReview(review);
      for (const draft of bundle.drafts ?? []) this.saveDraft(draft);
      if (options.publicOnly) for (const trail of bundle.trails) {
        const projected = projectTrail(trail, this.trailEvents(trail.trailId));
        if (projected.status === "draft") throw new Error("Public sync bundle contains an unpublished draft");
      }
    });
    return { importedTrails, importedEvents };
  }
  saveReport(report: Report): void {
    const identity = this.getIdentity(report?.reporterIdentityId);
    if (!identity || !verifyReport(report, identity)) throw new Error("Report signature verification failed");
    const existing = this.db.prepare("SELECT report_json FROM reports WHERE report_id=?").get(report.reportId) as Row | undefined;
    if (existing && canonicalize(read<Report>(existing, "report_json")) !== canonicalize(report)) throw new Error("Report id collision");
    if (!existing) this.db.prepare("INSERT INTO reports(report_id,report_json) VALUES (?,?)").run(report.reportId, JSON.stringify(report));
    this.audit("report", { reportId: report.reportId });
  }
  listReports(): Array<{ report: Report; status: string }> {
    return (this.db.prepare("SELECT report_json,status FROM reports ORDER BY report_id").all() as Row[]).map(row => ({ report: read(row, "report_json"), status: String(row.status) }));
  }
  moderate(input: { targetId: string; hidden: boolean; reason: string; operator: string; reportId?: string }): void {
    if (!input.reason.trim()) throw new Error("Moderation reason is required");
    this.transaction(() => {
      this.db.prepare("INSERT INTO moderation(target_id,hidden) VALUES (?,?) ON CONFLICT(target_id) DO UPDATE SET hidden=excluded.hidden").run(input.targetId, input.hidden ? 1 : 0);
      if (input.reportId) this.db.prepare("UPDATE reports SET status=? WHERE report_id=?").run(input.hidden ? "hidden" : "dismissed", input.reportId);
      this.audit("moderation", input);
      this.publications.invalidate();
      const trailId = this.getTrail(input.targetId)?.trailId ?? this.getEvent(input.targetId)?.recordId;
      if (trailId) this.changed(trailId);
    });
  }
  audit(action: string, details: unknown): void { this.db.prepare("INSERT INTO audit_log(action,details,created_at) VALUES (?,?,?)").run(action, JSON.stringify(details), new Date().toISOString()); }
  auditLog(): Row[] { return this.db.prepare("SELECT * FROM audit_log ORDER BY sequence DESC LIMIT 200").all() as Row[]; }
  purgeExpiredArtifacts(now = new Date().toISOString()): number {
    const result = this.db.prepare("UPDATE artifacts SET data=NULL WHERE json_extract(artifact_json,'$.retentionPolicy')='expires' AND json_extract(artifact_json,'$.expiresAt') IS NOT NULL AND json_extract(artifact_json,'$.expiresAt')<=?").run(now);
    const count = Number(result.changes);
    if (count) this.audit("retention_purge", { count, at: now });
    return count;
  }
  stats(): Record<string, unknown> {
    return { nodeId: this.nodeId, trails: (this.db.prepare("SELECT COUNT(*) AS n FROM trails").get() as Row).n,
      events: (this.db.prepare("SELECT COUNT(*) AS n FROM events").get() as Row).n,
      artifactBytes: (this.db.prepare("SELECT COALESCE(SUM(length(data)),0) AS n FROM artifacts").get() as Row).n,
      peers: this.listPeers().length, drafts: this.listDrafts().length, topics: this.listTopics({ limit: 100000 }).length,
      subproblems: this.listSubproblems().length, networkMode: this.networkMode(), bridgeEnabled: this.bridgeEnabled(), members: this.listMembers().length };
  }
  private summarizeReviews(reviews: Review[]): ResearchTrail["reviewSummary"] {
    const summary: ResearchTrail["reviewSummary"] = {};
    for (const review of reviews) summary[review.status] = (summary[review.status] ?? 0) + 1;
    return summary;
  }
  private deriveVerificationState(trail: ResearchTrail, reviews: Review[]): ResearchTrail["verificationState"] {
    const states = reviews.map(review => review.verificationState ?? (review.status === "challenged" || review.status === "corrected" || review.status === "not_reproducible" ? "challenged" : review.status === "withdrawn" ? "withdrawn" : review.status === "replicated" || review.status === "partially_replicated" ? "replicated" : undefined)).filter((state): state is NonNullable<ResearchTrail["verificationState"]> => !!state);
    if (states.includes("withdrawn")) return "withdrawn";
    if (states.includes("challenged")) return "challenged";
    if (states.includes("formally_verified")) return "formally_verified";
    if (states.includes("replicated")) return "replicated";
    return trail.verificationState ?? "author_claim";
  }
  private refreshTrail(id: string): void {
    const current = this.getTrail(id); if (!current) return;
    const events = this.trailEvents(id), trail = projectTrail(current, events);
    if (this.withdrawn("trail", id, trail.provenance.authorIdentityId)) trail.status = "retracted";
    trail.reviewSummary = this.summarizeReviews((this.db.prepare("SELECT review_json FROM reviews WHERE trail_id=?").all(id) as Row[]).map(row => read(row, "review_json")));
    this.db.prepare("UPDATE trails SET visibility=?,status=?,updated_at=?,trail_json=? WHERE trail_id=?").run(trail.visibility, trail.status, trail.provenance.updatedAt, JSON.stringify(trail), id);
    for (const table of ["trail_fts", "public_trail_fts"]) {
      this.db.prepare(`DELETE FROM ${table} WHERE trail_id=?`).run(id);
      const publicView = table === "public_trail_fts";
      const selected = publicView ? this.visibleEvents(events) : events;
      if (publicView && (!this.isPublicTrail(id) || projectTrail(trail, selected).status === "draft")) continue;
      this.db.prepare(`INSERT INTO ${table}(trail_id,title,abstract,domains,tags,event_text) VALUES (?,?,?,?,?,?)`)
        .run(id, trail.title, trail.abstract, trail.domains.join(" "), trail.tags.join(" "), selected.map(event => `${event.eventType} ${event.license ?? ""} ${JSON.stringify(event.payload)} ${JSON.stringify(event.citationRefs)}`).join(" "));
    }
  }
}
