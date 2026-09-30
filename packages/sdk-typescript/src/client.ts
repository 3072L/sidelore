import type { Bundle, Draft, Event, Identity, MembershipChange, NetworkPolicy, ResearchSubproblem, ResearchTopic, ResearchTrail, Review, Fork, Tombstone, Manifest, Report, TopicActivity, TopicReview } from "../../core/src/index.js";

export interface TrailRecord {
  trail: ResearchTrail;
  events: Event[];
  reviews: Review[];
  forks: Fork[];
  tombstones: Tombstone[];
}

export interface SideloreClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
}

export class SideloreClient {
  private readonly baseUrl: string;
  private readonly requestFetch: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;

  constructor(options: SideloreClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.requestFetch = options.fetch ?? globalThis.fetch;
    this.headers = options.headers ?? {};
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.requestFetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", ...this.headers, ...(init.headers ?? {}), ...(init.body ? { "content-type": "application/json" } : {}) }
    });
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body?.error ?? `Sidelore request failed (${response.status})`);
    return body;
  }

  health(): Promise<{ ok: boolean; nodeId: string; protocol: string; networkMode?: string; networkId?: string; bridgeEnabled?: boolean }> { return this.request("/v1/health"); }
  listTrails(filters: { query?: string; domain?: string; status?: string; visibility?: string } = {}): Promise<{ trails: ResearchTrail[] }> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key === "query" ? "q" : key, value);
    return this.request(`/v1/trails${params.size ? `?${params}` : ""}`);
  }
  getTrail(trailId: string): Promise<TrailRecord> { return this.request(`/v1/trails/${encodeURIComponent(trailId)}`); }
  registerIdentity(identity: Identity): Promise<Identity> { return this.request("/v1/identities", { method: "POST", body: JSON.stringify({ identity }) }); }
  createDraft(input: Partial<Draft> & { title?: string }): Promise<Draft> { return this.request("/v1/drafts", { method: "POST", body: JSON.stringify(input) }); }
  listDrafts(): Promise<{ drafts: Draft[] }> { return this.request("/v1/drafts"); }
  /** @deprecated Direct publication has no authorization. Use SideloreResearchClient.preparePublication. */
  publishTrail(_trail: ResearchTrail, _events: Event[] = [], _identity?: Identity): Promise<TrailRecord> { return Promise.reject(new Error("PUBLICATION_AUTHORIZATION_REQUIRED: save locally, prepare a snapshot and obtain approval")); }
  appendEvent(event: Event, identity?: Identity): Promise<Event> { return this.request("/v1/events", { method: "POST", body: JSON.stringify({ event, identity }) }); }
  citeRecord(event: Event, identity?: Identity): Promise<Event> { return this.request("/v1/citations", { method: "POST", body: JSON.stringify({ event, identity }) }); }
  verify(event: Event, identity?: Identity): Promise<{ valid: boolean; eventId: string; contentCid: string }> { return this.request("/v1/verify", { method: "POST", body: JSON.stringify({ event, identity }) }); }
  submitReview(review: Review): Promise<Review> { return this.request("/v1/reviews", { method: "POST", body: JSON.stringify(review) }); }
  submitFork(fork: Fork): Promise<Fork> { return this.request("/v1/forks", { method: "POST", body: JSON.stringify(fork) }); }
  submitTombstone(tombstone: Tombstone): Promise<Tombstone> { return this.request("/v1/tombstones", { method: "POST", body: JSON.stringify(tombstone) }); }
  getArtifact(cid: string): Promise<unknown> { return this.request(`/v1/artifacts/${encodeURIComponent(cid)}`); }
  manifest(): Promise<Manifest> { return this.request("/v1/sync/manifest"); }
  exportBundle(): Promise<Bundle> { return this.request("/v1/export"); }
  exportBackup(): Promise<Bundle> { return this.request("/v1/backup"); }
  importBundle(bundle: Bundle): Promise<{ importedTrails: number; importedEvents: number }> { return this.request("/v1/import", { method: "POST", body: JSON.stringify(bundle) }); }
  submitReport(report: Report): Promise<Report> { return this.request("/v1/reports", { method: "POST", body: JSON.stringify(report) }); }
  stats(): Promise<Record<string, unknown>> { return this.request("/v1/stats"); }
  listTopics(filters: { query?: string; domain?: string; status?: string; visibility?: string; publicOnly?: boolean } = {}): Promise<{ topics: ResearchTopic[] }> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key === "query" ? "q" : key, String(value));
    return this.request(`/v1/topics${params.size ? `?${params}` : ""}`);
  }
  getTopic(topicId: string, publicOnly = true): Promise<{ topic: ResearchTopic; subproblems: ResearchSubproblem[]; activities: TopicActivity[]; reviews: TopicReview[]; trails: ResearchTrail[] }> { return this.request(`/v1/topics/${encodeURIComponent(topicId)}?publicOnly=${publicOnly}`); }
  createTopic(topic: ResearchTopic, identity?: Identity): Promise<ResearchTopic> { return this.request("/v1/topics", { method: "POST", body: JSON.stringify({ topic, identity }) }); }
  createSubproblem(topicId: string, subproblem: ResearchSubproblem, identity?: Identity): Promise<ResearchSubproblem> { return this.request(`/v1/topics/${encodeURIComponent(topicId)}/subproblems`, { method: "POST", body: JSON.stringify({ subproblem, identity }) }); }
  submitTopicActivity(topicId: string, activity: TopicActivity, identity?: Identity): Promise<TopicActivity> { return this.request(`/v1/topics/${encodeURIComponent(topicId)}/activities`, { method: "POST", body: JSON.stringify({ activity, identity }) }); }
  submitTopicReview(review: TopicReview, identity?: Identity): Promise<TopicReview> { return this.request("/v1/topic-reviews", { method: "POST", body: JSON.stringify({ review, identity }) }); }
  membershipChanges(): Promise<{ changes: MembershipChange[]; members: string[] }> { return this.request("/v1/membership/changes"); }
  directoryTopics(query?: string): Promise<{ nodeId: string; topics: ResearchTopic[] }> { return this.request(`/v1/directory/topics${query ? `?q=${encodeURIComponent(query)}` : ""}`); }
  submitMembershipChange(change: MembershipChange, identities: Identity[] = []): Promise<MembershipChange> { return this.request("/v1/membership/changes", { method: "POST", body: JSON.stringify({ change, identities }) }); }
  networkPolicy(): Promise<NetworkPolicy | { networkId: string; mode: string; bridgeEnabled: boolean }> { return this.request("/v1/network/policy"); }
  saveNetworkPolicy(policy: NetworkPolicy, identities: Identity[] = []): Promise<NetworkPolicy> { return this.request("/v1/network/policy", { method: "POST", body: JSON.stringify({ policy, identities }) }); }
  bridgeExport(options: { publicOnly?: boolean; trailIds?: string[]; topicIds?: string[]; subproblemIds?: string[]; includeArtifactData?: boolean } = {}): Promise<Bundle> { return this.request("/v1/bridge/export", { method: "POST", body: JSON.stringify(options) }); }
  bridgeImport(bundle: Bundle, publicOnly = false): Promise<{ importedTrails: number; importedEvents: number }> { return this.request("/v1/bridge/import", { method: "POST", body: JSON.stringify({ bundle, publicOnly }) }); }

  async callMcp<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request<{ result: { structuredContent: T; isError?: boolean; content?: Array<{ text: string }> } }>("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }) });
    if (response.result.isError) throw new Error(response.result.content?.[0]?.text ?? "MCP request failed");
    return response.result.structuredContent;
  }
}
