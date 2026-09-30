# Trust boundaries

Research records are authenticated statements, not proofs that their conclusions
are true. Independent replication, counterexamples and reviews remain visible.

The trusted local core controls its encrypted vault, workspace and publication
authority. The renderer receives restricted operations and no master key. The
public website receives only approved records. Scoped Agent credentials have no
manual approval, grant creation, identity backup or network-administration power.

Publication permission binds an immutable snapshot CID, including body,
identities, filenames, attachment CIDs and reference dependencies, to a target
network. New records, signatures, subscriptions, imports and restored backups do
not confer permission. Every export path uses the approved library. Unapproved
dependencies stop preparation; already-approved dependencies are identified in
the preview. A foreign envelope cannot export matching private workspace bytes.

Peers, indexes and relay operators are untrusted content sources. Receiving nodes
verify network ID, pinned topic root, publisher envelope, original signatures,
CIDs, graph dependencies and record-ID consistency. Frames, pages, cache size,
dial concurrency and timeouts are bounded. Relay transport cannot modify accepted
signed content, but a relay or index can be unavailable, omit data or observe
connection metadata. Search is explicitly scoped to each responding source.

Organization profiles use separate data stores and member-gated encrypted
connections. They do not use public indexes; the operator must provide private
bootstrap infrastructure and member peer IDs. A Bridge policy merely enables
preparation; each outward snapshot requires human review. Network-wide recall
is not promised. Local cancellation/withdrawal cannot erase remote replicas.

Automatic grants are local and task-scoped, with persistent expiry, revocation,
count and size limits. They require a workspace explicitly created for public
research. Attachments are excluded by default. Suspicious content enters manual
review. Content detection cannot find every secret, and processes outside the
local service can make their own uploads. Protect operator credentials from
Agents and other untrusted local processes.
