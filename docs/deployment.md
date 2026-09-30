# Deploying a self-hosted research network

Ordinary participants install the desktop client or run the local CLI service.
They do not need a public IP, domain or reverse proxy. Only infrastructure
operators expose a bootstrap/relay listener and optionally a public index.

## Infrastructure node

`deploy/Dockerfile`, `deploy/compose.yaml` and `deploy/network.example.json` are
reusable configuration. They deliberately contain no invented public addresses.

1. Create `deploy/vault-passphrase.local` with a strong passphrase and restrict
   its permissions to 0600. Compose mounts it as a secret; keep it out of git.
2. Set a shared network ID and add independently operated bootstrap multiaddrs
   to `bootstrap`. Set `relayServer: true` only on infrastructure nodes.
3. Run `docker compose -f deploy/compose.yaml up --build -d`.
4. Read the node's announced Peer ID/addresses from its startup log. Distribute
   its reachable `/dns4/HOST/tcp/4001/p2p/PEER_ID` address in client profiles.
5. Open TCP 4001. Port 8788 is an optional public read/index surface. If it is
   used from an HTTPS website, terminate HTTPS at the operator's proxy.

The local operator port is **not published** by Compose. `/local`, `/mcp`,
backup, keys, membership and grants are absent from the public interface.
The public gateway serves approved content only. Its external storage contains
publication envelopes and snapshots, never local capabilities or private keys.

Run the same recipe on at least three separately reachable nodes, distributed
across at least two operators before calling this a public testnet. Verify
replacement bootstrap joining and NAT participation from independent networks.
No such external nodes have been deployed by this implementation task.

The bootstrap list is replaceable. Peers already known to each other continue
synchronizing when an index or website is unavailable. Topic links contain the
network ID, topic ID and pinned root CID. A receiver rejects a mismatched root.

## Headless local service

Environment settings:

| Setting | Purpose |
| --- | --- |
| `SIDELORE_DATA_DIR` | Local isolated data directory; defaults to `.sidelore` |
| `SIDELORE_LOCAL_PORT` | Loopback local API; defaults to 8787 |
| `SIDELORE_VAULT_PASSPHRASE_FILE` | Secret file used to initialize/unlock the vault |
| `SIDELORE_NETWORK_PROFILE` | Explicit network profile JSON |
| `SIDELORE_PUBLIC_PORT` | Enables a separate public read listener |
| `SIDELORE_PUBLIC_HOST` | Public bind address, default `0.0.0.0` |
| `SIDELORE_API_TOKEN` | Optional organization protection on the public gateway |

Saved connection preferences reconnect after an unlocked startup. An explicit
disconnect clears the preference. Restore clears it and revokes grants. A locked
headless vault requires local unlock before joining and signing.

## Organization deployment and Bridge

Use a **separate data directory** and an `organization` network profile, with
private bootstrap addresses and an explicit `memberPeerIds` list. Public indexes
are rejected for these profiles. Encrypted libp2p connections enforce membership,
and the DHT/topic namespace uses that network ID. Do not put a public relay in
an organization bootstrap list. Public HTTP is disabled for isolated storage.
Switching an organization store to another network through the connection API
is rejected; create a separate client/store instead.

Bridge enablement is a signed local policy. `bridge.prepare` requires human local
access, an explicit record selection and target network. `publication.approve`
then approves its exact CID. The local `/v1/bridge/export` accepts only that
approved intent ID and CID. It returns one signed snapshot. On the receiving
side verify/import this snapshot for its named network. Old bundle import is
always local and conveys no publication authority.

## Limits of current verification

The forced relay test uses loopback peers and proves Circuit Relay v2 transport;
it is not a test of two real households, router behavior or DCUtR success rates.
The 20-node test uses separate libp2p nodes and SQLite stores in one process,
TCP loopback, synthetic contributions and a transport restart. It measures
convergence and aggregate resources, not internet-scale capacity.

Implementation references: [DCUtR](https://libp2p.github.io/js-libp2p/modules/_libp2p_dcutr.html),
[GossipSub](https://libp2p.github.io/js-libp2p/modules/_libp2p_gossipsub.html),
[Electron security](https://www.electronjs.org/docs/latest/tutorial/security).
