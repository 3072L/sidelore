import { SideloreStore } from "../src/index.js";
import type { IdentityKeyPair, RecordRef } from "../../core/src/index.js";
export function publicProfile(store: SideloreStore, id = "test-public") {
  store.publications.saveProfile({ networkId: id, name: "Self hosted test", kind: "public", bootstrap: [], indexes: [], listen: ["/ip4/127.0.0.1/tcp/0"], autoConnect: false, relayServer: false, cacheBytes: 1024 ** 3, memberPeerIds: [] });
  store.setSetting("network_id", id); store.setSetting("network_mode", "federated");
}
export function approve(store: SideloreStore, signer: IdentityKeyPair, records: RecordRef[], topicId = "unscoped") {
  if (store.publications.profile(store.networkId()).kind === "local") publicProfile(store);
  const intent = store.publications.prepare({ workspaceId: "local", networkId: store.networkId(), topicId, records });
  return store.publications.approve(intent.intentId, intent.contentCid, signer);
}
