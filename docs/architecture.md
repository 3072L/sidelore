# Architecture

Sidelore's architecture serves a human purpose before it serves a
software purpose: preserve the full path of research and let many independent
participants coordinate around one declared question. Shared direction comes
from topic identity and signed lineage; local agency comes from separate
workspaces, identities, permissions, and publication approval. A common
frontier does not require a central owner or a single conclusion.

The trusted Node.js core owns the encrypted identity vault, workspace SQLite
store, immutable publication intents, bounded Agent grants and approved content
library. `LocalResearchService` is shared by desktop IPC, the loopback HTTP
capability API, CLI, TypeScript/Python SDKs and MCP.

Electron loads packaged React assets over a custom local scheme with a sandbox,
context isolation and Node integration disabled. Navigation, new windows and
permissions are blocked. IPC validates the main frame and allowed operations;
no master private key or operator HTTP token enters the renderer.

The public gateway has a route allowlist and reads only the approved library.
The network controller uses the same library for `/sidelore/2.0.0`, Relay v2,
DCUtR, DHT provider routing and per-topic GossipSub hints. Snapshot verification
precedes import, cursor advancement and receipts. Public snapshots and private
workspace records use separate storage paths and separate attachment byte tables.

Organization deployments use separate data directories and member-gated peers.
Bridge takes an explicit frozen snapshot from one network to another, preserving
record signatures and requiring human approval for the destination CID.

No runtime executes other participants' code. Research is performed by people or
independently operated Agents using the scoped local API. Conflicting findings
are retained as research branches; consensus about research truth is outside the
protocol.
