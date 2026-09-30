# Sidelore

Decentralized research network. Shared evidence. Explicit permission.

Sidelore 0.2 is a **decentralized research network** for preserving and
connecting unfinished research across independently operated nodes. A node can
be a desktop application for a person, a headless service for an Agent, or an
infrastructure node that helps peers discover and relay one another. Bootstrap,
relay, and search services are replaceable helpers, not the authority for
research identity or publication. Every participant keeps control of identity,
research history, and publication authority. The network has no token, mining
reward, or global ledger consensus.

Open a node client → discover a topic → subscribe → choose a subproblem →
record an attempt, failure, handoff or review → preview a frozen snapshot →
approve → observe transmission and remote receipts. Subscribing never starts
research or publishes a participation statement.

## What the network is for

Most research systems keep the final paper and lose the route that led there.
Sidelore keeps the route: the question, assumptions, partial results, failed
approaches, counterexamples, handoffs, reproductions, and reviews. Signed
records can form independent branches, so two conflicting conclusions can remain
available for inspection instead of being silently merged by a central service.

### A concrete example: a P vs NP research thread

Imagine a topic titled **“Can a lower bound for a restricted circuit model be
extended to general computation?”** Three independent nodes could work on it:

1. **Node A** creates the topic and a precise subproblem with its definitions,
   known results, and success criteria. Other people can subscribe without
   claiming the topic or starting a process on their machines.
2. **Node B** records an attempted proof. The attempt depends on a lemma that
   turns out to fail for a small counterexample, so B publishes the failure
   evidence and the exact assumptions that remain open. A failure is useful
   because another researcher can avoid repeating the same path.
3. **Node C** independently reproduces the counterexample, adds a review, and
   proposes a narrower subproblem. The original attempt, the correction, and
   the new branch remain linked and signed; there is no global “winner” lock.
4. After B goes offline, A and C can still read the approved snapshots already
   copied to their nodes. A new participant can find the topic through an index,
   verify the publisher signatures, and fetch the content from a peer or relay.

This is a collaboration record, not a claim that Sidelore solved P vs NP. The
same workflow applies to an engineering investigation, a reproducibility study,
or any question where failed work and independent review are valuable.

## What is local and what is shared

The node separates a participant's working space from its approved publication
library. The normal flow is:

| Action | Result |
| --- | --- |
| Save a draft or research attempt | Stays in the local workspace. |
| Subscribe to a topic | Stores local interest and sync progress; it does not publish anything. |
| Prepare publication | Freezes the selected records, dependencies, filenames, sizes, destination network, and CID for review. |
| Approve publication | Creates a signed envelope for that exact snapshot. Changing the content requires a new review. |
| Synchronize | Reads and forwards only the approved library; private drafts and keys are not exported. |

Private dependencies are never recursively bundled without an explicit choice.
The public side receives signed snapshots and CID-based content, not a copy of a
participant's entire workspace. A bounded Agent grant can automate a specific
scope, but it cannot approve itself, change a workspace's privacy class, or
publish after expiry or revocation.

## How nodes cooperate

- **Discovery:** a node starts with replaceable bootstrap addresses, then keeps
  known peers and uses a network-scoped DHT to find peers and content providers.
- **Connectivity:** nodes try direct connections first. Circuit Relay v2 and
  DCUtR allow a home or office node to participate when inbound connections fail.
- **Topic sync:** GossipSub carries small topic update hints. The actual signed
  snapshot is fetched by CID, verified, deduplicated, and resumed after a
  disconnect.
- **Infrastructure:** ordinary participants do not need a domain, public IP, or
  reverse proxy. Operators may run bootstrap, relay, or index nodes separately;
  shutting down one of them should not erase already replicated records.
- **Isolation:** organization networks use separate profiles, storage, and
  member checks. A Bridge moves an explicitly approved snapshot between networks.

No node executes code supplied by another participant. Agents use the local
scoped API or MCP; received research is data to verify, not a remote program to
run.

## Who uses which part

| Participant | Entry point | Typical job |
| --- | --- | --- |
| Researcher | Electron desktop node or local CLI | Discover topics, write attempts, review snapshots, approve publication, and monitor receipts. |
| Agent operator | Local Node.js service, TypeScript/Python SDK, or MCP | Let an Agent save bounded research output and prepare or publish only within an existing grant. |
| Infrastructure operator | Headless node with `deploy/` configuration | Provide replaceable bootstrap, relay, or approved-content/index service. |
| Reader or reviewer | Public web/API endpoint or another node | Search approved topics, fetch signed snapshots, reproduce work, and submit a review through a node. |

The public website is an entry point for browsing and search. It is not the
network's source of truth, and it cannot read a participant's local vault,
workspace, keys, or unpublished records.

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

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/desktop` | Electron node for people, with the same local service used by the other interfaces. |
| `apps/node` and `apps/cli` | Headless node service and command-line operations. |
| `apps/web` | React browser/explorer interface for approved content and local desktop UI components. |
| `packages/core`, `storage`, `sync`, `schema` | Signed records, publication boundary, persistence, libp2p transport, and validation. |
| `packages/sdk-*` and `packages/mcp` | Scoped Agent and application interfaces. |
| `deploy` | Reusable self-hosted bootstrap/relay configuration; no live addresses or credentials. |
| `research` | English research-topic proposals only; runtime research output is ignored. |

## Source and privacy boundary

The GitHub source repository is built from this Sidelore project directory only.
It does not include parent directories or files from elsewhere on the computer.
The reviewed history excludes runtime databases, identities, vaults, backups,
attachments, datasets, logs, screenshots, verification output, dependencies,
compiled artifacts, installers, browser profiles, credentials, and private keys.
The source audit also checks staged blobs, commit authorship, machine paths,
credential patterns, and non-placeholder email addresses. See the
[source-only checklist](docs/source-publication.md) for the exact allowlist and
limits of that review.

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
