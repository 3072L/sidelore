import { createSideloreP2PHandler, createSideloreP2PNode, peerAddress, type SideloreP2POptions } from "../../../packages/sync/src/index.js";
import type { ReplicationPolicy } from "../../../packages/core/src/index.js";
import { SideloreStore } from "../../../packages/storage/src/index.js";

export interface SideloreP2PServiceOptions extends SideloreP2POptions {
  policy?: ReplicationPolicy;
}

/** Optional transport adapter. HTTP remains the browser gateway; this exposes the same public bundle through libp2p. */
export async function createNodeP2PService(store: SideloreStore, options: SideloreP2PServiceOptions = {}) {
  if (!store.canFederate()) throw new Error("P2P federation is disabled on this isolated node");
  const handler = createSideloreP2PHandler(store);
  const policy = options.policy;
  const node = await createSideloreP2PNode({
    ...options,
    handler: options.handler ?? (async (request, remotePeer) => {
      const selected = request.policy ?? policy;
      const effective = selected ? { ...request, policy: selected } : request;
      return handler(effective, remotePeer);
    })
  });
  return { node, address: () => peerAddress(node), start: async () => { await node.start(); }, stop: async () => { await node.stop(); } };
}
