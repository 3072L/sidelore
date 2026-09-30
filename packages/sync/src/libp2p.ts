import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { identify, identifyPush } from "@libp2p/identify";
import { circuitRelayTransport, circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { dcutr } from "@libp2p/dcutr";
import { kadDHT } from "@libp2p/kad-dht";
import { gossipsub } from "@libp2p/gossipsub";
import { ping } from "@libp2p/ping";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { multiaddr, type Multiaddr } from "@multiformats/multiaddr";
import type { Libp2p, Stream, PrivateKey } from "@libp2p/interface";
import * as lp from "it-length-prefixed";
import { concat } from "uint8arrays/concat";
import type { Bundle, Manifest, ReplicationPolicy, PublishedSnapshot } from "../../core/src/index.js";

export const SIDELORE_P2P_PROTOCOL = "/sidelore/2.0.0";
const MAX_FRAME_BYTES = 50 * 1024 * 1024;
export interface SideloreP2PContentRequest {
  eventCids?: string[];
  artifactCids?: string[];
  trailIds?: string[];
  topicIds?: string[];
  subproblemIds?: string[];
  policy?: ReplicationPolicy;
  includeArtifactData?: boolean;
}
export type SideloreP2PRequest = { networkId?: string; policy?: ReplicationPolicy } & (
  | { type: "manifest"; policy?: ReplicationPolicy }
  | { type: "bundle"; policy?: ReplicationPolicy; includeArtifactData?: boolean }
  | ({ type: "content" } & SideloreP2PContentRequest)
  | { type: "discover"; query?: string }
  | { type: "topic-page"; topicId: string; after?: number; limit?: number }
  | { type: "publication"; cid: string }
  | { type: "artifact"; cid: string }
  | { type: "receive"; publication: PublishedSnapshot }
);
export type SideloreP2PResponse = { ok: true; value: unknown } | { ok: false; error: string };
export type SideloreP2PHandler = (request: SideloreP2PRequest, remotePeer: string) => Promise<unknown>;

export interface SideloreP2PBackend {
  canFederate?(): boolean;
  manifest(policy?: ReplicationPolicy): Manifest;
  exportBundle(options?: { publicOnly?: boolean; policy?: ReplicationPolicy; trailIds?: string[]; topicIds?: string[]; subproblemIds?: string[]; includeArtifactData?: boolean; includeMembership?: boolean }): Bundle;
  exportContent?(options: SideloreP2PContentRequest): Bundle;
}

export function createSideloreP2PHandler(backend: SideloreP2PBackend): SideloreP2PHandler {
  return async (request) => {
    if (backend.canFederate && !backend.canFederate()) throw new Error("Federation is disabled on this node");
    if (request.type === "manifest") return backend.manifest(request.policy);
    if (request.type === "content" && backend.exportContent) return backend.exportContent(request);
    if (request.type === "bundle") return backend.exportBundle({ publicOnly: true, policy: request.policy, includeArtifactData: request.includeArtifactData ?? false });
    throw new Error("Unsupported Sidelore P2P request");
  };
}

async function frame(value: unknown): Promise<Uint8Array> {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const chunks: Uint8Array[] = [];
  for await (const encoded of lp.encode([payload])) chunks.push(encoded.slice());
  return concat(chunks);
}

async function readFrame(stream: AsyncIterable<Uint8Array | { slice(): Uint8Array }>): Promise<unknown> {
  for await (const decoded of lp.decode(stream as AsyncIterable<Uint8Array>, { maxDataLength: MAX_FRAME_BYTES })) {
    const bytes = decoded.slice();
    if (bytes.byteLength > MAX_FRAME_BYTES) throw new Error("P2P frame exceeds 50 MiB");
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  throw new Error("Peer closed before sending a response");
}

export interface SideloreP2POptions {
  listen?: string[];
  handler?: SideloreP2PHandler;
  privateKey?: PrivateKey;
  networkId?: string;
  relayServer?: boolean;
  discovery?: boolean;
  memberPeerIds?: string[];
}

export async function createSideloreP2PNode(options: SideloreP2POptions = {}): Promise<Libp2p> {
  const handler = options.handler ?? (async () => ({ manifest: [] }));
  const node = await createLibp2p({
    privateKey: options.privateKey,
    addresses: { listen: options.listen ?? ["/ip4/127.0.0.1/tcp/0"] },
    transports: [tcp(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: options.memberPeerIds ? {
      denyInboundEncryptedConnection: (peer) => !options.memberPeerIds!.includes(peer.toString()),
      denyOutboundEncryptedConnection: (peer) => !options.memberPeerIds!.includes(peer.toString())
    } : undefined,
    services: {
      identify: identify(), identifyPush: identifyPush(), ping: ping(), dcutr: dcutr(),
      ...(options.discovery ? { dht: kadDHT({ protocol: `/sidelore/kad/${options.networkId ?? "test"}/2`, clientMode: !options.relayServer }), pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }) } : {}),
      ...(options.relayServer ? { relay: circuitRelayServer({ reservations: { maxReservations: 128 } }) } : {})
    }
  });
  await node.handle(SIDELORE_P2P_PROTOCOL, async (stream, connection) => {
    const timeout = setTimeout(() => stream.abort(new Error("P2P request timed out")), 15000);
    try {
      const request = await readFrame(stream) as SideloreP2PRequest;
      if (options.networkId && request.networkId !== options.networkId) throw new Error("Network ID mismatch");
      const value = await handler(request, connection.remotePeer.toString());
      stream.send(await frame({ ok: true, value } satisfies SideloreP2PResponse));
      await stream.close();
    } catch (error) {
      try {
        stream.send(await frame({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies SideloreP2PResponse));
        await stream.close();
      } catch {
        stream.abort(error instanceof Error ? error : new Error(String(error)));
      }
    } finally { clearTimeout(timeout); }
  }, { runOnLimitedConnection: true, maxInboundStreams: 16, maxOutboundStreams: 16 });
  return node;
}

export async function requestFromPeer<T>(node: Libp2p, address: string | Multiaddr, request: SideloreP2PRequest, onSent?: () => void): Promise<T> {
  const stream: Stream = await node.dialProtocol(typeof address === "string" ? multiaddr(address) : address, SIDELORE_P2P_PROTOCOL, { signal: AbortSignal.timeout(10000), runOnLimitedConnection: true });
  const timeout = setTimeout(() => stream.abort(new Error("P2P response timed out")), 15000);
  try {
    stream.send(await frame(request));
    onSent?.();
    const response = await readFrame(stream) as SideloreP2PResponse;
    await stream.close();
    if (!response.ok) throw new Error(response.error);
    return response.value as T;
  } finally { clearTimeout(timeout); if (stream.status === "open") stream.abort(new Error("Request closed")); }
}

export function peerAddress(node: Libp2p): Multiaddr | undefined {
  const address = node.getMultiaddrs().find((candidate) => candidate.toString().includes("/tcp/"));
  if (!address) return undefined;
  return address.toString().includes("/p2p/") ? address : address.encapsulate(`/p2p/${node.peerId.toString()}`);
}
