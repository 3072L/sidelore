import { canonicalBytes } from "../../core/src/index.js";
import { signBytes, verifyBytes, type Bundle, type Identity, type IdentityKeyPair, type Manifest, type ReplicationPolicy } from "../../core/src/index.js";

export function missingCids(local: Manifest, remote: Manifest): { events: string[]; artifacts: string[]; trails: string[]; topics?: string[]; subproblems?: string[]; topicActivities?: string[]; topicReviews?: string[] } {
  const events = new Set(local.events);
  const artifacts = new Set(local.artifacts);
  const trails = new Set(local.trails.map((trail) => trail.trailId));
  const result: { events: string[]; artifacts: string[]; trails: string[]; topics?: string[]; subproblems?: string[]; topicActivities?: string[]; topicReviews?: string[] } = {
    events: remote.events.filter((cid) => !events.has(cid)),
    artifacts: remote.artifacts.filter((cid) => !artifacts.has(cid)),
    trails: remote.trails.filter((trail) => !trails.has(trail.trailId)).map((trail) => trail.trailId)
  };
  if (local.topics || remote.topics) {
    const topics = new Set((local.topics ?? []).map(topic => topic.topicId));
    result.topics = (remote.topics ?? []).filter(topic => !topics.has(topic.topicId)).map(topic => topic.topicId);
  }
  if (local.subproblems || remote.subproblems) {
    const subproblems = new Set(local.subproblems ?? []);
    result.subproblems = (remote.subproblems ?? []).filter(id => !subproblems.has(id));
  }
  if (local.topicActivities || remote.topicActivities) {
    const activities = new Set(local.topicActivities ?? []);
    result.topicActivities = (remote.topicActivities ?? []).filter(cid => !activities.has(cid));
  }
  if (local.topicReviews || remote.topicReviews) {
    const reviews = new Set(local.topicReviews ?? []);
    result.topicReviews = (remote.topicReviews ?? []).filter(id => !reviews.has(id));
  }
  return result;
}

export function isPortableBundle(value: unknown): value is Bundle {
  const bundle = value as Partial<Bundle> | null;
  return Boolean(bundle && bundle.format === "sidelore.bundle" && bundle.version === 1 && Array.isArray(bundle.events) && Array.isArray(bundle.trails));
}

export interface PeerCard {
  peerId: string;
  endpoint: string;
  identityId: string;
  publicKey: string;
  capabilities: string[];
  createdAt: string;
  signature: string;
}

export function createPeerCard(input: Omit<PeerCard, "identityId" | "publicKey" | "signature">, identity: IdentityKeyPair): PeerCard {
  const body = { ...input, identityId: identity.identity.identityId, publicKey: identity.identity.primaryPublicKey };
  return { ...body, signature: signBytes(canonicalBytes(body), identity.privateKey) };
}

export function verifyPeerCard(card: PeerCard, identity?: Identity): boolean {
  const { signature: _signature, ...body } = card;
  const signer = identity ?? { identityId: card.identityId, primaryPublicKey: card.publicKey, keyType: "ed25519", boundPasskeys: [], createdAt: card.createdAt, rotationChain: [], displayName: card.peerId, agentOrHuman: "agent" } satisfies Identity;
  return signer.identityId === card.identityId && verifyBytes(canonicalBytes(body), card.signature, signer.primaryPublicKey);
}

export interface SyncResult { peer: string; importedTrails: number; importedEvents: number; }

export class FederatedNodeClient {
  constructor(private readonly endpoint: string, private readonly requestFetch: typeof globalThis.fetch = globalThis.fetch, private readonly headers: Record<string, string> = {}) {}
  async manifest(policy?: ReplicationPolicy): Promise<Manifest> {
    const params = new URLSearchParams();
    if (policy?.domains?.length) params.set("domain", policy.domains.join(","));
    if (policy?.authors?.length) params.set("author", policy.authors.join(","));
    if (policy?.since) params.set("since", policy.since);
    if (policy?.artifacts) params.set("artifacts", policy.artifacts);
    if (policy?.maxArtifactBytes !== undefined) params.set("maxArtifactBytes", String(policy.maxArtifactBytes));
    if (policy?.mediaTypes?.length) params.set("mediaType", policy.mediaTypes.join(","));
    const response = await this.requestFetch(`${this.endpoint.replace(/\/$/, "")}/v1/sync/manifest${params.size ? `?${params}` : ""}`, { headers: this.headers });
    if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
    return response.json() as Promise<Manifest>;
  }
  async exportBundle(): Promise<Bundle> {
    const response = await this.requestFetch(`${this.endpoint.replace(/\/$/, "")}/v1/export`, { headers: this.headers });
    if (!response.ok) throw new Error(`Bundle request failed (${response.status})`);
    return response.json() as Promise<Bundle>;
  }
  async exportContent(options: { eventCids?: string[]; artifactCids?: string[]; trailIds?: string[]; topicIds?: string[]; subproblemIds?: string[]; policy?: ReplicationPolicy; includeArtifactData?: boolean } = {}): Promise<Bundle> {
    const response = await this.requestFetch(`${this.endpoint.replace(/\/$/, "")}/v1/sync/content`, { method: "POST", headers: { ...this.headers, "content-type": "application/json" }, body: JSON.stringify(options) });
    if (!response.ok) throw new Error(`Content request failed (${response.status})`);
    return response.json() as Promise<Bundle>;
  }
  async pull(bundle: Bundle): Promise<SyncResult> {
    const response = await this.requestFetch(`${this.endpoint.replace(/\/$/, "")}/v1/sync/pull`, { method: "POST", headers: { ...this.headers, "content-type": "application/json" }, body: JSON.stringify({ bundle }) });
    if (!response.ok) throw new Error(`Bundle pull failed (${response.status})`);
    return { peer: this.endpoint, ...(await response.json() as { importedTrails: number; importedEvents: number }) };
  }
  async bridgeExport(options: { publicOnly?: boolean; trailIds?: string[]; topicIds?: string[]; subproblemIds?: string[]; includeArtifactData?: boolean } = {}): Promise<Bundle> {
    const response = await this.requestFetch(`${this.endpoint.replace(/\/$/, "")}/v1/bridge/export`, { method: "POST", headers: { ...this.headers, "content-type": "application/json" }, body: JSON.stringify(options) });
    if (!response.ok) throw new Error(`Bridge export failed (${response.status})`);
    return response.json() as Promise<Bundle>;
  }
  async bridgeImport(bundle: Bundle, publicOnly = false): Promise<SyncResult> {
    const response = await this.requestFetch(`${this.endpoint.replace(/\/$/, "")}/v1/bridge/import`, { method: "POST", headers: { ...this.headers, "content-type": "application/json" }, body: JSON.stringify({ bundle, publicOnly }) });
    if (!response.ok) throw new Error(`Bridge import failed (${response.status})`);
    return { peer: this.endpoint, ...(await response.json() as { importedTrails: number; importedEvents: number }) };
  }
}

export * from "./libp2p.js";
