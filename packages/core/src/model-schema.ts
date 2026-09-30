import { z } from "zod";

const id = z.string().min(1).max(512);
const timestamp = z.string().datetime({ offset: true });
const strings = z.array(z.string()).max(10000);
export const visibilitySchema = z.enum(["public", "federated", "private"]);
export const statusSchema = z.enum(["draft", "active", "negative", "unresolved", "partial", "reframed", "retracted"]);
export const eventTypeSchema = z.enum(["hypothesis", "experiment", "observation", "failure", "counterexample", "pivot", "result", "open_question", "review", "fork", "response", "retraction", "tombstone"]);
export const verificationStateSchema = z.enum(["author_claim", "unverified", "replicated", "challenged", "formally_verified", "withdrawn"]);
export const topicStatusSchema = z.enum(["open", "active", "blocked", "solved", "reopened", "retired"]);
export const subproblemStatusSchema = z.enum(["open", "active", "blocked", "solved", "reopened"]);
export const topicActivityTypeSchema = z.enum(["attempt_started", "handoff_requested", "summary", "status_update", "challenge", "evidence_link"]);
export const networkModeSchema = z.enum(["isolated", "federated"]);
const authorKind = z.enum(["human", "agent", "synthetic"]);
const encryption = z.enum(["none", "xchacha20-poly1305"]);
const jsonObject = z.record(z.string(), z.unknown());
const objectiveSchema = z.object({ question: z.string().min(1), successCriteria: strings, constraints: strings }).strict();

export const identitySchema = z.object({
  identityId: id, primaryPublicKey: id, keyType: z.literal("ed25519"),
  boundPasskeys: strings, createdAt: timestamp, rotationChain: strings,
  recoveryMetadata: jsonObject.optional(), displayName: z.string().min(1).max(200), agentOrHuman: authorKind
}).strict();
export const artifactRefSchema = z.object({
  cid: id, label: z.string().optional(), mediaType: z.string().optional(), byteSize: z.number().int().nonnegative().optional(),
  encryptionMode: encryption.optional(), keyEnvelope: jsonObject.optional()
}).strict();
export const citationSchema = z.object({
  recordId: id.optional(), eventId: id.optional(), locator: z.string().optional(), quote: z.string().optional(),
  relation: z.enum(["supports", "contradicts", "context", "derived_from"]).optional()
}).strict().refine(value => Boolean(value.recordId || value.eventId), { message: "Citation must identify a recordId or eventId" });
export const eventSchema = z.object({
  eventId: id, recordId: id, parentEventIds: strings, authorIdentityId: id, eventType: eventTypeSchema,
  payload: jsonObject, artifactRefs: z.array(artifactRefSchema), citationRefs: z.array(citationSchema),
  visibility: visibilitySchema, license: z.string().optional(), createdAt: timestamp, signature: id, contentCid: id
}).strict();
export const trailSchema = z.object({
  initialStatus: statusSchema, contentCid: id, signature: id, trailId: id, title: z.string().min(1).max(500),
  abstract: z.string(), domains: strings, tags: strings, headEventIds: strings, status: statusSchema,
  visibility: visibilitySchema, contributors: strings, artifactManifest: z.array(artifactRefSchema),
  citationIndex: z.array(citationSchema), reviewSummary: z.record(z.string(), z.number().int().nonnegative()),
  provenance: z.object({ authorIdentityId: id, authorType: authorKind, recordedBy: z.string(), createdAt: timestamp,
    updatedAt: timestamp, signatureStatus: z.enum(["valid", "invalid", "unverified"]).optional(), license: z.string().optional() }).strict(),
  topicId: id.optional(), subproblemId: id.optional(), objective: objectiveSchema.optional(),
  verificationState: verificationStateSchema.optional(), derivedVerificationState: verificationStateSchema.optional(), verificationEvidenceIds: strings.optional()
}).strict();
export const artifactSchema = z.object({
  cid: id, mediaType: z.string().min(1), byteSize: z.number().int().nonnegative(), checksum: id,
  encryptionMode: encryption, nonce: z.string().optional(), authTag: z.string().optional(), keyEnvelope: jsonObject.optional(),
  license: z.string().optional(), retentionPolicy: z.enum(["until_revoked", "expires", "local_only"]).optional(),
  expiresAt: timestamp.optional(), sourceEventId: id.optional()
}).strict().superRefine((value, context) => {
  if (value.retentionPolicy === "expires" && !value.expiresAt) context.addIssue({ code: "custom", message: "Expiring artifacts require expiresAt", path: ["expiresAt"] });
});
export const reviewSchema = z.object({
  reviewId: id, trailId: id, eventId: id.optional(), reviewerIdentityId: id,
  status: z.enum(["seen", "replicated", "partially_replicated", "challenged", "corrected", "not_reproducible", "withdrawn"]),
  method: z.string().min(1), result: z.string().min(1), createdAt: timestamp, signature: id,
  topicId: id.optional(), verificationState: verificationStateSchema.optional()
}).strict();
export const forkSchema = z.object({
  forkId: id, sourceTrailId: id, sourceEventId: id, newTrailId: id, authorIdentityId: id,
  relationType: z.enum(["extends", "reproduces", "contradicts", "corrects", "narrows", "generalizes", "abandons"]),
  reason: z.string().min(1), createdAt: timestamp, signature: id
}).strict();
export const tombstoneSchema = z.object({
  tombstoneId: id, targetType: z.enum(["trail", "event", "artifact"]), targetId: id,
  reason: z.enum(["author_request", "privacy", "copyright", "security", "superseded"]),
  requestedBy: id, createdAt: timestamp, signature: id, recallPeers: strings.optional()
}).strict();
export const reportSchema = z.object({
  reportId: id, targetType: z.enum(["trail", "event", "artifact"]), targetId: id, reporterIdentityId: id,
  category: z.enum(["spam", "privacy", "copyright", "security", "other"]), details: z.string().min(1), createdAt: timestamp, signature: id
}).strict();
export const replicationPolicySchema = z.object({
  domains: strings.optional(), authors: strings.optional(), since: timestamp.optional(),
  artifacts: z.enum(["none", "public", "encrypted", "all"]).optional(),
  maxArtifactBytes: z.number().int().nonnegative().optional(), mediaTypes: strings.optional()
}).strict();
export const topicSchema = z.object({
  topicId: id, question: z.string().min(1).max(10000), context: z.string().max(100000), domains: strings, tags: strings,
  successCriteria: strings, status: topicStatusSchema, derivedStatus: topicStatusSchema.optional(), visibility: visibilitySchema, maintainers: strings,
  governancePolicy: z.object({ requiredSignatures: z.number().int().positive(), allowedMembers: strings.optional() }).strict(),
  createdAt: timestamp, updatedAt: timestamp, createdBy: id, contentCid: id, signature: id
}).strict();
export const subproblemSchema = z.object({
  subproblemId: id, topicId: id, title: z.string().min(1).max(500), statement: z.string().min(1), constraints: strings,
  dependsOn: strings, status: subproblemStatusSchema, derivedStatus: subproblemStatusSchema.optional(), participantIds: strings, linkedTrailIds: strings,
  createdAt: timestamp, updatedAt: timestamp, createdBy: id, contentCid: id, signature: id
}).strict();
export const membershipApprovalSchema = z.object({ identityId: id, signature: id }).strict();
export const topicActivitySchema = z.object({
  activityId: id, topicId: id, subproblemId: id.optional(), activityType: topicActivityTypeSchema,
  payload: jsonObject, authorIdentityId: id, visibility: visibilitySchema, verificationState: verificationStateSchema.optional(), createdAt: timestamp, contentCid: id, signature: id,
  governanceApprovals: z.array(membershipApprovalSchema).optional()
}).strict();
export const topicReviewSchema = z.object({
  reviewId: id, topicId: id, subproblemId: id.optional(), reviewerIdentityId: id,
  status: z.enum(["seen", "replicated", "partially_replicated", "challenged", "corrected", "not_reproducible", "withdrawn"]),
  method: z.string().min(1), result: z.string().min(1), createdAt: timestamp, signature: id
}).strict();
export const membershipChangeSchema = z.object({
  changeId: id, networkId: id, memberIdentityId: id, action: z.enum(["grant", "revoke"]), roles: strings,
  reason: z.string().optional(), requiredSignatures: z.number().int().positive(), approvals: z.array(membershipApprovalSchema),
  createdAt: timestamp, contentCid: id
}).strict();
export const networkPolicySchema = z.object({
  networkId: id, mode: networkModeSchema, directoryEnabled: z.boolean(), bridgeEnabled: z.boolean(),
  requiredSignatures: z.number().int().positive(), createdAt: timestamp, updatedAt: timestamp, updatedBy: id,
  contentCid: id, approvals: z.array(membershipApprovalSchema)
}).strict();
export const draftSchema = z.object({
  draftId: id, trail: trailSchema.partial().extend({ title: z.string().min(1) }), events: z.array(eventSchema),
  createdAt: timestamp, updatedAt: timestamp, published: z.boolean(), ownerIdentityId: id.optional(),
  proposedEvents: z.array(z.object({ eventType: eventTypeSchema, payload: jsonObject }).strict()).optional()
}).strict();
const bundleContentSchema = z.object({
  format: z.literal("sidelore.bundle"), version: z.literal(1), exportedAt: timestamp,
  identities: z.array(identitySchema), trails: z.array(trailSchema), events: z.array(eventSchema),
  artifacts: z.array(artifactSchema), reviews: z.array(reviewSchema), forks: z.array(forkSchema), tombstones: z.array(tombstoneSchema),
  artifactData: z.record(z.string(), z.string()).optional(), drafts: z.array(draftSchema).optional(),
  topics: z.array(topicSchema).optional(), subproblems: z.array(subproblemSchema).optional(),
  topicActivities: z.array(topicActivitySchema).optional(), membershipChanges: z.array(membershipChangeSchema).optional(),
  topicReviews: z.array(topicReviewSchema).optional(),
  networkPolicy: networkPolicySchema.optional()
}).strict();
export const publicationSchema = z.object({
  snapshot: z.object({ protocol: z.literal("sidelore.publication/2"), networkId: id, topicId: id, bundle: bundleContentSchema }).strict(),
  envelope: z.object({ protocol: z.literal("sidelore.publication/2"), networkId: id, contentCid: id, publisherIdentityId: id, approvedAt: timestamp, authorization: z.enum(["human", "grant"]), signature: id }).strict(),
  publisher: identitySchema
}).strict();
export const bundleSchema = bundleContentSchema.extend({ publications: z.array(publicationSchema).optional() });
