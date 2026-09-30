# Publication protocol v2

Signed research records keep their original v1 shape and signatures. The
libp2p wire protocol is `/sidelore/2.0.0`. Publication permission is a separate
outer layer; neither visibility flags, signatures, subscriptions nor network
connections grant it.

## Objects and state

`NetworkProfile`: immutable network kind, ID, bootstrap addresses, optional
indexes, listen addresses, relay role, cache limit, auto-connect preference and
organization member peer IDs. A profile is local configuration, not authority
to publish workspace records.

`TopicSubscription`: network/topic/root CID, local subscription time and
per-peer cursors. It is not a signed participation claim.

`PublicationIntent`: local-only workspace/Agent binding, explicit selection,
frozen `PublicationSnapshot`, its CID, review warnings, dependency list,
filenames/attachment sizes, total bytes and publication/receipt/retry state.

`PublicationSnapshot`: protocol `sidelore.publication/2`, network ID, topic ID,
and a complete signed-record bundle. Attachment bytes are detached; metadata and
references bind their CIDs. Derived trail fields are rebuilt from selected
records before freezing. No drafts, grants, membership, network policy or vault
material enters the snapshot. Already-approved dependencies can be copied;
unapproved dependencies cause preparation to stop. Existing records are never
silently redacted or re-signed.

`PublicationEnvelope`: protocol, network ID, snapshot content CID, publisher ID,
approval time, authorization class (`human`/`grant`) and Ed25519 signature over
canonical JSON. A `PublishedSnapshot` contains the snapshot, envelope and
publisher public identity. Receiving nodes verify the envelope, CID, original
record signatures, graph and record-ID consistency before committing.

`AgentPublishGrant`: local Agent/workspace/topic/network/content-kind binding,
expiry, attachment policy, max count/bytes, consumed counters and revocation.
Only human capabilities can create grants, and only for an explicitly public
research workspace. Quotas and approval commit atomically. Expiry, revocation,
wrong task/Agent/type and suspicious content return output to human review.
Restart/retry cannot reset counters or restore invalid authority.

## Local operations

Send `{ "method": "publication.prepare", "args": { "workspaceId": "local",
"networkId": "my-network", "topicId": "topic-ID", "records": [{ "kind":
"topics", "id": "topic-ID" }] } }` to the authenticated local `/local` API.

The returned intent contains the entire frozen snapshot and preview. Human
approval calls `publication.approve` with `intentId` and `contentCid`. Agent
`publication.auto` also supplies its pre-existing `grantId`; the Agent identity
comes from its capability, never from a request field. The Agent API has no
manual approval or grant-management tool.

Record kinds: `topics`, `subproblems`, `trails`, `events`, `topicActivities`,
`topicReviews`, `reviews`, `forks`, `tombstones`, `artifacts`. Select each new
record explicitly. A new event on an approved trail does not expand its old
snapshot or automatically publish.

## Sync

Every request includes the receiving network ID. Organization peers must also
pass the encrypted connection member allowlist. Requests include `discover`,
`topic-page`, `publication`, `receive`, `artifact`, plus compatibility manifest
and bundle requests. Topic pages carry monotonically increasing local sequence
cursors and snapshot CIDs. Cursors advance only after every record on the page
has been fetched and verified. Deduplication uses network ID + snapshot CID.
Branches combine by verified-record union; research conclusions may conflict.

GossipSub channels are scoped to network/topic and carry only CID hints. No
workspace body, draft, filename or arbitrary executable code is broadcast.
DHT provider keys locate approved topic content; keyword search is a separate
multi-index/peer query with explicit source attribution.

`receive` returns the CID and authenticated peer ID after commit. A sender shows
approval, handed-to-transport status and distinct remote receipts. Missing
receipts explicitly mean the content may still only exist locally. Retries are
bounded and recheck task grants. Attachment bytes are requested separately and
verified against approved metadata, with a cache limit.

Cancelling unsent output removes it from the local publishable view. Once sent,
a local withdrawal request stops further local forwarding but cannot erase
remote copies. This release records that request; it does not provide a
network-wide recall guarantee or force peers to remove data.

## Migration and recovery

Opening an old database does not create envelopes. Old public records are
pending local candidates. Old bundles remain locally importable; they cannot
be accepted for automatic replication without valid envelopes. Backups omit
publication authority. Restore disconnects and revokes automatic grants.

Browser identity migration exports an encrypted file from the original browser
origin. The desktop verifies key correspondence and vault decryption, then
returns a signed receipt bound to that backup CID. The original browser clears
its old identity only after verifying that receipt. Failed verification retains
the old data. New identities and all routine signing reside in the local vault.

The approved artifact byte store is separate from workspace bytes. A foreign
envelope referencing a matching local CID cannot cause private local bytes to
be exported; bytes must have been locally approved or explicitly downloaded as
approved public content.
