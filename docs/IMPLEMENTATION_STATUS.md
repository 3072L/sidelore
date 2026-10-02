# Implementation and verification status

Release: **0.2.0 self-hosted testnet**. Sidelore is a decentralized research
network; this repository contains its replaceable-node implementation together
with desktop, headless, web, and Agent interfaces. An operated public testnet
and independently verified native releases remain external acceptance work.

| Area | Implemented capabilities |
| --- | --- |
| Publication and migration | Separate approved snapshot library; immutable CID-bound preview; signed publication envelopes; private-dependency checks; manual approval; scoped grants with expiry, revocation, and durable quotas; encrypted identity backup and verified migration; restore disconnects and clears automatic authority |
| Networking and sync | Persistent profiles, identity, peers, subscriptions, and cursors; replaceable bootstrap; Relay v2/DCUtR; scoped DHT; topic GossipSub hints; paginated content fetch, verification, deduplication, and retry; independent branches; cache limits; explicit attachment downloads; separate sent and receipt states |
| UI and Agent access | Topics, subproblems, attempts, failure evidence, handoffs, and reviews; explicit subscriptions; frozen publication preview; workspace and identity management; TypeScript/Python clients; local MCP with restricted Agent capabilities |
| Distribution | Electron desktop build targets for macOS, Windows, and Linux; headless CLI; tag-triggered native-platform prerelease workflow; Docker/Compose configuration |

## Reproducible checks

```sh
npm ci
npm run test:source
npm test
npm run validate
npm run test:desktop
npm run test:scale
```

Unit and integration checks cover signatures, publication boundaries, private
dependencies, migration, recovery, Agent permissions, multi-node cooperation,
relay transport, and localized consent/status text. Validation generates fresh
synthetic input in memory and reads no local dataset.

Desktop checks cover research creation, frozen preview, manual approval, restart
persistence, four selectable languages, light/dark themes, and narrow layouts.
They use an isolated temporary profile. Scale checks generate synthetic records
and exercise synchronization over local loopback connections.

Reports, screenshots, runtime databases, and installer checksums remain local
and are excluded from this source release. Verification commands write generated
output to ignored locations. Re-run the checks for the specific source revision
and target platform being released.

## Remaining external acceptance work

1. Operate at least three publicly reachable bootstrap/relay nodes across at
   least two independent operators before labeling a release a public testnet.
2. Verify direct-connection failures, relay participation, and DCUtR upgrades
   across real household networks. Loopback checks do not establish NAT success.
3. Verify native installers and UI behavior on every supported operating system;
   provision signing/notarization credentials separately from the source tree.
4. Build and run the supplied container configuration in a Docker environment.
5. Measure multi-machine and wide-area synchronization. Local benchmarks do not
   establish global capacity.

Withdrawals stop local forwarding and record a request; peer copies may remain.
The implementation makes no claim of complete secret detection, full-network
search coverage, or billion-participant capacity.

## Source release scope

Only source code, English documentation, schemas, dependency manifests, and
reviewed deployment examples are included. Localized UI resources and their
tests intentionally contain other languages. Data files, research results,
identities, verification output, backups, and installed or compiled artifacts
are excluded. See [source publication](source-publication.md).
