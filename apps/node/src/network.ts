import { multiaddr } from "@multiformats/multiaddr";
import { CID } from "multiformats/cid";
import type { Libp2p, PrivateKey } from "@libp2p/interface";
import {
  cidFromValue,
  type NetworkProfile,
  type PublishedSnapshot,
} from "../../../packages/core/src/index.js";
import {
  createSideloreP2PNode,
  requestFromPeer,
  type SideloreP2PRequest,
} from "../../../packages/sync/src/index.js";
import type { SideloreStore } from "../../../packages/storage/src/index.js";

const channel = (network: string, topic: string) =>
  `/sidelore/topic/${cidFromValue({ network, topic })}`;
const providerKey = (network: string, topic: string) =>
  CID.parse(cidFromValue({ network, topic }));
type Page = {
  networkId: string;
  topicId: string;
  entries: Array<{ sequence: number; cid: string }>;
  nextCursor: number;
  hasMore: boolean;
};

export class ResearchNetwork {
  node?: Libp2p;
  private profile?: NetworkProfile;
  private timer?: ReturnType<typeof setInterval>;
  private work?: Promise<unknown>;
  private errors: string[] = [];
  private announced = new Set<string>();
  private desired = new Set<string>();
  private lastDiscovery = 0;
  private stopping = false;
  constructor(
    private store: SideloreStore,
    private privateKey: () => PrivateKey,
    private intervalMs = 5000,
  ) {}
  status() {
    return {
      connected: !!this.node,
      networkId: this.profile?.networkId,
      peerId: this.node?.peerId.toString(),
      addresses: this.node?.getMultiaddrs().map((a) => a.toString()) ?? [],
      peers:
        this.node
          ?.getConnections()
          .map((c) => ({
            peerId: c.remotePeer.toString(),
            relayed: !!c.limits,
            address: c.remoteAddr.toString(),
          })) ?? [],
      errors: this.errors.slice(-8),
      release: "self-hosted-testnet",
    };
  }
  async connect(networkId: string) {
    if (this.node && this.profile?.networkId === networkId)
      return this.status();
    await this.disconnect(false);
    const profile = this.store.publications.profile(networkId);
    if (profile.kind === "local")
      throw new Error("Local research does not connect to a network");
    const previous = this.store.publications
      .profiles()
      .find((p) => p.networkId === this.store.networkId());
    if (previous?.kind === "organization" && previous.networkId !== networkId)
      throw new Error(
        "Organization networks require separate storage; use Bridge to transfer approved snapshots",
      );
    if (profile.kind === "organization" && !profile.memberPeerIds.length)
      throw new Error("Organization network requires member peer IDs");
    this.profile = profile;
    this.stopping = false;
    this.store.setSetting("network_id", networkId);
    this.store.setSetting(
      "network_mode",
      profile.kind === "public" ? "federated" : "isolated",
    );
    this.node = await createSideloreP2PNode({
      networkId,
      privateKey: this.privateKey(),
      listen: [
        ...profile.listen,
        ...(!profile.relayServer ? ["/p2p-circuit"] : []),
      ],
      relayServer: profile.relayServer,
      discovery: true,
      ...(profile.kind === "organization"
        ? { memberPeerIds: profile.memberPeerIds }
        : {}),
      handler: (r, peer) => this.handle(r, peer),
    });
    const pubsub: any = this.node.services.pubsub;
    pubsub?.addEventListener("message", (event: any) => {
      const detail = event.detail;
      if (detail.data.byteLength > 2048 || !this.desired.has(detail.topic))
        return;
      // Notifications are only hints. The signed content is fetched and verified during sync.
      void this.sync();
    });
    this.store.setSetting("network_connected", true);
    this.store.setSetting("auto_connect_network", networkId);
    this.store.publications.saveProfile({ ...profile, autoConnect: true });
    this.timer = setInterval(() => void this.sync(), this.intervalMs);
    this.timer.unref();
    await this.sync();
    return this.status();
  }
  async disconnect(clearPreference = true) {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const node = this.node;
    this.node = undefined;
    await node?.stop();
    await this.work?.catch(() => undefined);
    this.announced.clear();
    this.desired.clear();
    this.store.setSetting("network_connected", false);
    if (clearPreference) {
      this.store.setSetting("auto_connect_network", null);
      if (this.profile)
        this.store.publications.saveProfile({
          ...this.profile,
          autoConnect: false,
        });
    }
    return this.status();
  }
  private async handle(request: SideloreP2PRequest, peer: string) {
    if (
      !this.node ||
      !this.profile ||
      this.stopping ||
      request.networkId !== this.profile.networkId
    )
      throw new Error("Network unavailable");
    const p = this.store.publications,
      networkId = this.profile.networkId;
    if (
      this.profile.kind === "organization" &&
      !this.profile.memberPeerIds.includes(peer)
    )
      throw new Error("Network member required");
    if (request.type === "topic-page")
      return p.page(networkId, request.topicId, request.after, request.limit);
    if (request.type === "publication") {
      const value = p.get(request.cid, networkId);
      if (!value) throw new Error("Publication not found");
      p.sent(request.cid);
      return value;
    }
    if (request.type === "receive") {
      const value = request.publication;
      if (
        !this.profile.relayServer &&
        !p
          .subscriptions(networkId)
          .some((s) => s.topicId === value?.snapshot?.topicId)
      )
        throw new Error("Topic is not subscribed on this node");
      p.accept(value, networkId);
      return {
        receivedCid: value.envelope.contentCid,
        peerId: this.node.peerId.toString(),
      };
    }
    if (request.type === "discover")
      return {
        source: this.node.peerId.toString(),
        topics: p
          .view(networkId)
          .searchTopics({ query: request.query, publicOnly: true, limit: 100 }),
      };
    if (request.type === "artifact") {
      const a = this.store.getPublicArtifact(request.cid);
      if (!a?.data) throw new Error("Approved attachment bytes unavailable");
      return {
        cid: request.cid,
        data: Buffer.from(a.data).toString("base64url"),
      };
    }
    if (request.type === "manifest")
      return p.view(networkId).manifest(request.policy);
    if (request.type === "bundle" || request.type === "content") {
      const result = p.export(networkId, {
        includeArtifactData: request.includeArtifactData,
      });
      for (const value of result.publications ?? [])
        p.sent(value.envelope.contentCid);
      return result;
    }
    throw new Error("Unknown protocol request");
  }
  sync(): Promise<unknown> {
    if (this.work) return this.work;
    if (!this.node || !this.profile || this.stopping)
      return Promise.resolve(this.status());
    this.work = this.runSync()
      .catch((e) => {
        this.errors.push(e.message);
        return this.status();
      })
      .finally(() => {
        this.work = undefined;
      });
    return this.work;
  }
  private async runSync() {
    const node = this.node!,
      profile = this.profile!,
      p = this.store.publications;
    const networkId = profile.networkId;
    const saved =
      this.store.getSetting<string[]>(`known_peers:${networkId}`) ?? [];
    const addresses = [...new Set([...profile.bootstrap, ...saved])].slice(
      0,
      64,
    );
    // Bound concurrent dialing and retry every tick, preserving the outbox on any failure.
    for (let i = 0; i < addresses.length && !this.stopping; i += 4)
      await Promise.allSettled(
        addresses.slice(i, i + 4).map(async (a) => {
          if (node.getConnections().some((c) => c.remoteAddr.toString() === a))
            return;
          try {
            await node.dial(multiaddr(a), {
              signal: AbortSignal.timeout(3000),
            });
          } catch (e) {
            this.errors.push(`Connection unavailable: ${a}`);
          }
        }),
      );
    const connections = node.getConnections();
    const advertised: string[] = [];
    for (const connection of connections) {
      const peer = await node.peerStore.get(connection.remotePeer).catch(() => undefined);
      for (const address of peer?.addresses ?? []) {
        const value = address.multiaddr;
        advertised.push(value.toString().endsWith(`/p2p/${connection.remotePeer}`) ? value.toString() : value.encapsulate(`/p2p/${connection.remotePeer}`).toString());
      }
    }
    this.store.setSetting(
      `known_peers:${networkId}`,
      [
        ...new Set([
          ...saved,
          ...connections.map((c) =>
            c.remoteAddr.toString().includes("/p2p/")
              ? c.remoteAddr.toString()
              : c.remoteAddr.encapsulate(`/p2p/${c.remotePeer}`).toString(),
          ),
          ...advertised,
        ]),
      ].slice(-128),
    );
    const pubsub: any = node.services.pubsub;
    const subs = p.subscriptions(networkId);
    const channels = new Set(subs.map((s) => channel(networkId, s.topicId)));
    for (const c of this.desired) if (!channels.has(c)) pubsub?.unsubscribe(c);
    for (const c of channels) if (!this.desired.has(c)) pubsub?.subscribe(c);
    this.desired = channels;
    for (const sub of subs)
      for (const connection of connections) {
        if (this.stopping) return;
        const peer = connection.remotePeer.toString();
        const address = connection.remoteAddr.toString().includes("/p2p/")
          ? connection.remoteAddr
          : connection.remoteAddr.encapsulate(`/p2p/${peer}`);
        try {
          let cursor = sub.cursors[peer] ?? 0;
          for (let pages = 0; pages < 100; pages++) {
            const page = await requestFromPeer<Page>(node, address, {
              type: "topic-page",
              networkId,
              topicId: sub.topicId,
              after: cursor,
              limit: 100,
            });
            if (
              page.networkId !== networkId ||
              page.topicId !== sub.topicId ||
              !Array.isArray(page.entries) ||
              page.entries.length > 100 ||
              !Number.isSafeInteger(page.nextCursor) ||
              page.nextCursor < cursor
            )
              throw new Error("Invalid sync page");
            for (const entry of page.entries) {
              if (p.get(entry.cid, networkId)) continue;
              const value = await requestFromPeer<PublishedSnapshot>(
                node,
                address,
                { type: "publication", networkId, cid: entry.cid },
              );
              if (
                value.envelope.contentCid !== entry.cid ||
                value.snapshot.topicId !== sub.topicId
              )
                throw new Error("Publication does not match announcement");
              if (
                sub.rootCid &&
                !value.snapshot.bundle.topics?.some(
                  (t) =>
                    t.topicId === sub.topicId && t.contentCid === sub.rootCid,
                )
              )
                throw new Error(
                  "Topic root does not match the pinned share link",
                );
              p.accept(value, networkId);
            }
            sub.cursors[peer] = page.nextCursor;
            sub.lastSyncAt = new Date().toISOString();
            delete sub.lastError;
            p.saveSubscription(sub);
            if (!page.hasMore || page.nextCursor === cursor) break;
            cursor = page.nextCursor;
          }
        } catch (e) {
          sub.lastError = e instanceof Error ? e.message : String(e);
          p.saveSubscription(sub);
        }
      }
    for (const intent of p
      .intents()
      .filter(
        (i) =>
          i.snapshot.networkId === networkId &&
          p.canSend(i) &&
          (!i.nextRetryAt || i.nextRetryAt <= new Date().toISOString()),
      )) {
      if (this.stopping) return;
      const value = p.get(intent.contentCid, networkId);
      if (!value) continue;
      const c = channel(networkId, intent.snapshot.topicId);
      if (!this.announced.has(intent.contentCid)) {
        try {
          await pubsub?.publish(
            c,
            new TextEncoder().encode(
              JSON.stringify({ cid: intent.contentCid }),
            ),
          );
          this.announced.add(intent.contentCid);
        } catch {
          /* retry on the next tick */
        }
      }
      for (const conn of connections) {
        const peer = conn.remotePeer.toString();
        if (intent.receivedBy.includes(peer)) continue;
        const address = conn.remoteAddr.toString().includes("/p2p/")
          ? conn.remoteAddr
          : conn.remoteAddr.encapsulate(`/p2p/${peer}`);
        try {
          // Authorization is checked immediately before each transmission, including retries.
          if (!p.canSend(p.intent(intent.intentId))) break;
          const receipt = await requestFromPeer<{
            receivedCid: string;
            peerId: string;
          }>(
            node,
            address,
            { type: "receive", networkId, publication: value },
            () => p.sent(intent.contentCid),
          );
          if (
            receipt.receivedCid !== intent.contentCid ||
            receipt.peerId !== peer
          )
            throw new Error("Invalid receipt");
          p.sent(intent.contentCid, peer);
        } catch (e) {
          p.failed(intent.intentId, e instanceof Error ? e.message : String(e));
        }
      }
    }
    // DHT locates providers; it is never used as a keyword index or to publish workspace content.
    if (Date.now() - this.lastDiscovery > 60000 && connections.length) {
      this.lastDiscovery = Date.now();
      for (const sub of subs.slice(0, 32)) {
        try {
          if (p.page(networkId, sub.topicId, 0, 1).entries.length)
            await node.contentRouting.provide(
              providerKey(networkId, sub.topicId),
              { signal: AbortSignal.timeout(2000) },
            );
          for await (const provider of node.contentRouting.findProviders(
            providerKey(networkId, sub.topicId),
            { signal: AbortSignal.timeout(2000) },
          )) {
            if (this.stopping) break;
            await node.peerStore.merge(provider.id, {
              multiaddrs: provider.multiaddrs,
            });
            await node
              .dial(provider.id, { signal: AbortSignal.timeout(2000) })
              .catch(() => undefined);
          }
        } catch {
          /* DHT bootstrap is best effort; known peers still synchronize. */
        }
      }
    }
    this.errors = this.errors.slice(-8);
    return this.status();
  }
  async search(query: string) {
    const profile = this.profile;
    if (!profile || profile.kind !== "public") return [];
    const indexes = await Promise.all(
      profile.indexes.map(async (source) => {
        try {
          const url = new URL("/v1/directory/topics", source);
          url.searchParams.set("q", query);
          const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            redirect: "error",
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return {
            source,
            coverage: "this-index-only",
            topics: ((await response.json()) as any).topics ?? [],
          };
        } catch (e) {
          return {
            source,
            coverage: "this-index-only",
            topics: [],
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    const peers = await Promise.all(
      (this.node?.getConnections() ?? []).slice(0, 8).map(async (conn) => {
        const source = `peer:${conn.remotePeer}`;
        try {
          const address = conn.remoteAddr.toString().includes("/p2p/")
            ? conn.remoteAddr
            : conn.remoteAddr.encapsulate(`/p2p/${conn.remotePeer}`);
          const result = await requestFromPeer<{ topics: unknown[] }>(
            this.node!,
            address,
            { type: "discover", networkId: profile.networkId, query },
          );
          return { source, coverage: "this-peer-only", topics: result.topics };
        } catch (e) {
          return {
            source,
            coverage: "this-peer-only",
            topics: [],
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    return [...indexes, ...peers];
  }
  async fetchArtifact(cid: string) {
    if (!this.node || !this.profile)
      throw new Error("Connect before downloading attachments");
    for (const conn of this.node.getConnections()) {
      try {
        const address = conn.remoteAddr.toString().includes("/p2p/")
          ? conn.remoteAddr
          : conn.remoteAddr.encapsulate(`/p2p/${conn.remotePeer}`);
        const response = await requestFromPeer<{ cid: string; data: string }>(
          this.node,
          address,
          { type: "artifact", networkId: this.profile.networkId, cid },
        );
        if (response.cid !== cid) continue;
        const bytes = Buffer.from(response.data, "base64url");
        this.store.publications.cacheArtifact(
          this.profile.networkId,
          cid,
          bytes,
        );
        return { cid, data: response.data, byteSize: bytes.length };
      } catch {
        /* try the next content provider */
      }
    }
    throw new Error("Attachment is unavailable from connected providers");
  }
}
