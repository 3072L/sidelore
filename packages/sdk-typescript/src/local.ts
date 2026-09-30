import type {
  PreparePublicationInput,
  PublicationIntent,
  RecordRef,
} from "../../core/src/index.js";

/** Agent capability: the node binds this token to a workspace. No approval or grant-management methods. */
export class SideloreResearchClient {
  constructor(
    private options: {
      baseUrl: string;
      token: string;
      fetch?: typeof globalThis.fetch;
    },
  ) {}
  private async call<T>(method: string, args: unknown = {}): Promise<T> {
    const r = await (this.options.fetch ?? fetch)(
      `${this.options.baseUrl.replace(/\/$/, "")}/local`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ method, args }),
      },
    );
    const body = (await r.json()) as any;
    if (!r.ok)
      throw new Error(body.error ?? `Local request failed (${r.status})`);
    return body as T;
  }
  saveResearch(
    input: Record<string, unknown>,
  ): Promise<{
    result: unknown;
    records: RecordRef[];
    workspaceId: string;
    publication: "local-only";
  }> {
    return this.call("research.save", input);
  }
  listResearch(): Promise<unknown> {
    return this.call("research.list");
  }
  getTopic(topicId: string): Promise<unknown> {
    return this.call("research.topic", { topicId });
  }
  subscribe(
    networkId: string,
    topicId: string,
    rootCid?: string,
  ): Promise<unknown> {
    return this.call("subscription.add", { networkId, topicId, rootCid });
  }
  preparePublication(
    input: Omit<PreparePublicationInput, "workspaceId" | "bridge">,
  ): Promise<PublicationIntent> {
    return this.call("publication.prepare", input);
  }
  publishWithGrant(
    intentId: string,
    contentCid: string,
    grantId: string,
  ): Promise<PublicationIntent> {
    return this.call("publication.auto", { intentId, contentCid, grantId });
  }
  publicationStatus(): Promise<PublicationIntent[]> {
    return this.call("publication.list");
  }
  search(
    query: string,
  ): Promise<Array<{ source: string; topics: unknown[]; error?: string }>> {
    return this.call("network.search", { query });
  }
}
