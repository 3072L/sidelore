export type AuthorKind = "human" | "agent" | "synthetic";
export type Visibility = "public" | "federated" | "private";
export type TrailStatus =
  | "draft"
  | "active"
  | "negative"
  | "unresolved"
  | "partial"
  | "reframed"
  | "retracted";

export type EventType =
  | "hypothesis"
  | "experiment"
  | "observation"
  | "failure"
  | "counterexample"
  | "pivot"
  | "result"
  | "open_question"
  | "review"
  | "fork"
  | "response"
  | "retraction"
  | "tombstone";

export type ReviewStatus =
  | "seen"
  | "replicated"
  | "partially_replicated"
  | "challenged"
  | "corrected"
  | "not_reproducible"
  | "withdrawn";

/** State of the research objective, kept separate from verification. */
export type VerificationState =
  | "author_claim"
  | "unverified"
  | "replicated"
  | "challenged"
  | "formally_verified"
  | "withdrawn";

export type TopicStatus = "open" | "active" | "blocked" | "solved" | "reopened" | "retired";
export type SubproblemStatus = "open" | "active" | "blocked" | "solved" | "reopened";
export type NetworkMode = "isolated" | "federated";
export type TopicActivityType =
  | "attempt_started"
  | "handoff_requested"
  | "summary"
  | "status_update"
  | "challenge"
  | "evidence_link";

export type ForkRelation =
  | "extends"
  | "reproduces"
  | "contradicts"
  | "corrects"
  | "narrows"
  | "generalizes"
  | "abandons";

export interface Identity {
  identityId: string;
  primaryPublicKey: string;
  keyType: "ed25519";
  boundPasskeys: string[];
  createdAt: string;
  rotationChain: string[];
  recoveryMetadata?: Record<string, unknown>;
  displayName: string;
  agentOrHuman: AuthorKind;
}

export interface IdentityKeyPair {
  identity: Identity;
  privateKey: string;
}

export interface ArtifactRef {
  cid: string;
  label?: string;
  mediaType?: string;
  byteSize?: number;
  encryptionMode?: "none" | "xchacha20-poly1305";
  keyEnvelope?: Record<string, unknown>;
}

export interface CitationRef {
  recordId?: string;
  eventId?: string;
  locator?: string;
  quote?: string;
  relation?: "supports" | "contradicts" | "context" | "derived_from";
}

export interface ResearchObjective {
  question: string;
  successCriteria: string[];
  constraints: string[];
}

export interface ResearchTopic {
  topicId: string;
  question: string;
  context: string;
  domains: string[];
  tags: string[];
  successCriteria: string[];
  status: TopicStatus;
  derivedStatus?: TopicStatus;
  visibility: Visibility;
  maintainers: string[];
  governancePolicy: { requiredSignatures: number; allowedMembers?: string[] };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  contentCid: string;
  signature: string;
}

export interface ResearchSubproblem {
  subproblemId: string;
  topicId: string;
  title: string;
  statement: string;
  constraints: string[];
  dependsOn: string[];
  status: SubproblemStatus;
  derivedStatus?: SubproblemStatus;
  participantIds: string[];
  linkedTrailIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  contentCid: string;
  signature: string;
}

export interface TopicActivity {
  activityId: string;
  topicId: string;
  subproblemId?: string;
  activityType: TopicActivityType;
  payload: Record<string, unknown>;
  authorIdentityId: string;
  visibility: Visibility;
  verificationState?: VerificationState;
  createdAt: string;
  contentCid: string;
  signature: string;
  governanceApprovals?: MembershipApproval[];
}

export interface TopicReview {
  reviewId: string;
  topicId: string;
  subproblemId?: string;
  reviewerIdentityId: string;
  status: ReviewStatus;
  method: string;
  result: string;
  createdAt: string;
  signature: string;
}

export interface MembershipApproval {
  identityId: string;
  signature: string;
}

/** A grant or revocation is one signed, replayable policy decision. */
export interface MembershipChange {
  changeId: string;
  networkId: string;
  memberIdentityId: string;
  action: "grant" | "revoke";
  roles: string[];
  reason?: string;
  requiredSignatures: number;
  approvals: MembershipApproval[];
  createdAt: string;
  contentCid: string;
}

export interface NetworkPolicy {
  networkId: string;
  mode: NetworkMode;
  directoryEnabled: boolean;
  bridgeEnabled: boolean;
  requiredSignatures: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  contentCid: string;
  approvals: MembershipApproval[];
}

export interface UnsignedEvent {
  recordId: string;
  parentEventIds: string[];
  authorIdentityId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  artifactRefs: ArtifactRef[];
  citationRefs: CitationRef[];
  visibility: Visibility;
  license?: string;
  createdAt: string;
}

export interface Event extends UnsignedEvent {
  eventId: string;
  signature: string;
  contentCid: string;
}

export interface TrailProvenance {
  authorIdentityId: string;
  authorType: AuthorKind;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
  signatureStatus?: "valid" | "invalid" | "unverified";
  license?: string;
}

export interface ResearchTrail {
  initialStatus: TrailStatus;
  contentCid: string;
  signature: string;
  trailId: string;
  title: string;
  abstract: string;
  domains: string[];
  tags: string[];
  headEventIds: string[];
  status: TrailStatus;
  visibility: Visibility;
  contributors: string[];
  artifactManifest: ArtifactRef[];
  citationIndex: CitationRef[];
  reviewSummary: Partial<Record<ReviewStatus, number>>;
  provenance: TrailProvenance;
  /** Optional links make a trail an attempt inside a topic/subproblem. */
  topicId?: string;
  subproblemId?: string;
  objective?: ResearchObjective;
  verificationState?: VerificationState;
  derivedVerificationState?: VerificationState;
  verificationEvidenceIds?: string[];
}

export interface Artifact {
  cid: string;
  mediaType: string;
  byteSize: number;
  checksum: string;
  encryptionMode: "none" | "xchacha20-poly1305";
  nonce?: string;
  authTag?: string;
  keyEnvelope?: Record<string, unknown>;
  license?: string;
  retentionPolicy?: "until_revoked" | "expires" | "local_only";
  expiresAt?: string;
  sourceEventId?: string;
}

export interface Fork {
  forkId: string;
  sourceTrailId: string;
  sourceEventId: string;
  newTrailId: string;
  authorIdentityId: string;
  relationType: ForkRelation;
  reason: string;
  createdAt: string;
  signature: string;
}

export interface Review {
  reviewId: string;
  trailId: string;
  eventId?: string;
  reviewerIdentityId: string;
  status: ReviewStatus;
  method: string;
  result: string;
  createdAt: string;
  signature: string;
  topicId?: string;
  verificationState?: VerificationState;
}

export interface Tombstone {
  tombstoneId: string;
  targetType: "trail" | "event" | "artifact";
  targetId: string;
  reason: "author_request" | "privacy" | "copyright" | "security" | "superseded";
  requestedBy: string;
  createdAt: string;
  signature: string;
  recallPeers?: string[];
}

export interface Draft {
  draftId: string;
  trail: Partial<ResearchTrail> & Pick<ResearchTrail, "title">;
  events: Event[];
  createdAt: string;
  updatedAt: string;
  published: boolean;
  ownerIdentityId?: string;
  proposedEvents?: Array<{ eventType: EventType; payload: Record<string, unknown> }>;
}

export interface Report {
  reportId: string;
  targetType: "trail" | "event" | "artifact";
  targetId: string;
  reporterIdentityId: string;
  category: "spam" | "privacy" | "copyright" | "security" | "other";
  details: string;
  createdAt: string;
  signature: string;
}

export interface ReplicationPolicy {
  domains?: string[];
  authors?: string[];
  since?: string;
  artifacts?: "none" | "public" | "encrypted" | "all";
  maxArtifactBytes?: number;
  mediaTypes?: string[];
}

export interface Manifest {
  nodeId: string;
  generatedAt: string;
  trails: Array<{ trailId: string; updatedAt: string; status: TrailStatus; visibility: Visibility }>;
  events: string[];
  artifacts: string[];
  tombstones: string[];
  reviews: string[];
  forks: string[];
  topics?: Array<{ topicId: string; updatedAt: string; status: TopicStatus; visibility: Visibility }>;
  subproblems?: string[];
  topicActivities?: string[];
  topicReviews?: string[];
}

export interface Bundle {
  format: "sidelore.bundle";
  version: 1;
  exportedAt: string;
  identities: Identity[];
  trails: ResearchTrail[];
  events: Event[];
  artifacts: Artifact[];
  reviews: Review[];
  forks: Fork[];
  tombstones: Tombstone[];
  /** Optional local export payloads, keyed by artifact CID. Public metadata can be exported without blobs. */
  artifactData?: Record<string, string>;
  /** Included only in an operator backup, never in federation bundles. */
  drafts?: Draft[];
  topics?: ResearchTopic[];
  subproblems?: ResearchSubproblem[];
  topicActivities?: TopicActivity[];
  topicReviews?: TopicReview[];
  membershipChanges?: MembershipChange[];
  networkPolicy?: NetworkPolicy;
  /** Only these signed snapshots confer permission to replicate. Backups omit them. */
  publications?: import("./publication.js").PublishedSnapshot[];
}
