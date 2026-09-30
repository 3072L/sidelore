# Sidelore

Decentralized research network. Shared evidence. Explicit permission.

Sidelore 0.2 is a **decentralized research network** for preserving and
connecting unfinished research across independently operated nodes. People use
an Electron node client, Agents use a local Node.js service and scoped SDK/MCP,
and replaceable bootstrap, relay, and index services help nodes find one
another. Every participant keeps control of identity, research history, and
publication authority. The network has no token, mining reward, or global
ledger consensus.

Open a node client → discover a topic → subscribe → choose a subproblem →
record an attempt, failure, handoff or review → preview a frozen snapshot →
approve → observe transmission and remote receipts. Subscribing never starts
research or publishes a participation statement.

The interface supports **Simplified Chinese, Traditional Chinese, English, and Japanese**. Choose a
language in the upper-right corner; the first launch follows your system language
and later launches remember your choice. The adjacent sun/moon button switches
between light and dark themes. Both preferences stay on this device. Research
content, signatures, publication snapshots, and filenames remain unchanged.

The workspace uses a compact sidebar, topic cards, readable publication previews,
and separate approval/transmission/receipt steps. Full signed snapshots and
connection diagnostics remain available in expandable details.

Our first-topic shortlist focuses on **prize-backed open mathematics**, with
**P vs NP** recommended as a long-term collaborative question. The
[topic comparison](research/prize-topics.md) records official sources, prize
conditions, and possible research branches; the Riemann hypothesis is another
candidate. These are proposals, with no new mathematical result claimed and no
research record automatically published.

## Run

Use Node.js 24 or newer.

```sh
npm ci
npm test
npm run validate
npm run desktop
```

Headless operation:

```sh
npm run node
npm run cli -- local network.status
npm run cli -- local research.save input.json
```

The headless service listens on loopback port 8787. Its capability connection
file is `.sidelore/local-connection.json` (mode 0600). Initialize/unlock the vault
with `identity.initialize` / `identity.unlock` via the local CLI, or set
`SIDELORE_VAULT_PASSPHRASE_FILE` to a local secret file. Do not give the operator
connection file to an Agent; create a scoped credential with `agent.create`.

The desktop creates an identity automatically when OS credential protection is
available. Otherwise it asks for a vault passphrase. Identity backups use a
separately chosen passphrase so that OS-protected identities can be restored
on another machine. Master keys are not exposed to the renderer, MCP or SDK.

## Publishing and connecting

New records always remain local, including records with a legacy `public`
visibility field. The publication service:

1. Freezes explicitly selected records and already-approved dependencies.
2. Lists the exact body, identities, references, filenames, attachments, target
   network, CID and total size. Unapproved dependencies stop preparation.
3. Binds human approval or a bounded Agent task grant to that snapshot CID.
4. Stores a signed publication envelope in a separate approved library.
5. Serves only that library through HTTP, P2P and public indexes.

Unsent output can be cancelled. Once sent, withdrawal stops this node's
forwarding and records a withdrawal request; remote copies may remain.
“Sent” means handed to a transport. A remote receipt is shown separately.

Use **Network and subscriptions** to add an operator-provided network profile.
Bootstrap addresses, known peers, identity and subscriptions persist. The v2
transport supports Circuit Relay v2, DCUtR, a network-scoped DHT, topic
GossipSub hints, cursor-based catch-up, CID verification, deduplication and
retries. The default automatic cache limit is 1 GiB; attachment bytes are
requested explicitly. Ordinary clients do not run a relay server.

No production bootstrap addresses are bundled. Public release requires three
reachable bootstrap/relay nodes operated by at least two independent operators.
Until then this version is explicitly a **self-hosted testnet**. See
[deployment](docs/deployment.md) and [verification status](docs/IMPLEMENTATION_STATUS.md).

## Network interfaces: website, node clients, and Agents

```sh
npm run web
npm run build:web
```

The public website is a browse, search, and sharing entry point for approved
network records. Research creation and publication happen through a participant
node. Search identifies each index/peer source and makes no network-wide
completeness claim.

A local MCP endpoint is available at `POST /mcp`, using an Agent bearer
credential. Its tools expose saving, preparation, subscription and bounded
grant use; human approval, vault and grant administration are absent.
`SideloreResearchClient` is provided by both the TypeScript and Python SDKs.
See [API](docs/api/openapi.yaml) and [Agent example](docs/agents.md).

## Packaging and verification

For GitHub source publication, follow the [source-only checklist](docs/source-publication.md).
`npm run audit:source` checks the staged file contents and rejects files outside
the source allowlist, symlinks, local state, and recognizable secret/path patterns.

```sh
npm run test:desktop
npm run test:scale
npm run package:desktop
```

Electron Builder has macOS DMG/ZIP, Windows NSIS and Linux AppImage/DEB targets.
The manually triggered CI workflow builds each on its native OS. Signed releases
require operator signing/notarization credentials. Test reports and screenshots
are generated locally in the ignored `verification/` directory. Source releases
contain no datasets, stored identities, research records, or verification output.
See the [status document](docs/IMPLEMENTATION_STATUS.md) for remaining acceptance work.

Legacy research signatures remain unchanged. Old bundles and backups import
locally without publication authority. Restore disconnects the network and
revokes automatic grants. Organization storage, member checks and connection
profiles remain separate from public networking; Bridge requires an individually
approved snapshot even when enabled.

Content checks cannot detect every secret. The application cannot control
uploads made by other programs outside its local service. Nodes verify authorship
and content integrity, not the truth of research claims.
