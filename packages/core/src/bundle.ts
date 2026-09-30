import type { Bundle } from "./types.js";
import { verifyEvent } from "./event.js";
import { verifyTrail } from "./records.js";
import { isValidIdentity } from "./identity.js";
import { verifyFork, verifyReview, verifyTombstone, verifyTopicReview } from "./governance.js";
import { verifyMembershipChange, verifyNetworkPolicy, verifyResearchSubproblem, verifyResearchTopic, verifyTopicActivity, verifyTopicActivityGovernance } from "./topic.js";
import { bundleSchema } from "./model-schema.js";
import { cidFromBytes } from "./cid.js";
import { decode } from "./sodium.js";
import { verifyPublication } from "./publication.js";

export function createBundle(input: Omit<Bundle, "format" | "version" | "exportedAt">, now = new Date().toISOString()): Bundle {
  return { format: "sidelore.bundle", version: 1, exportedAt: now, ...input };
}

/** Verifies structure and signatures. Parent and ownership checks also run at the destination store. */
export function verifyBundle(bundle: Bundle): { valid: boolean; errors: string[] } {
  const shape = bundleSchema.safeParse(bundle);
  if (!shape.success) return { valid: false, errors: shape.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`) };
  const errors: string[] = [];
  for (const publication of bundle.publications ?? []) if (!verifyPublication(publication, publication.snapshot.networkId)) errors.push("Invalid publication envelope");
  const identities = new Map(bundle.identities.map(identity => [identity.identityId, identity]));
  if (identities.size !== bundle.identities.length) errors.push("Duplicate identity");
  for (const identity of identities.values()) if (!isValidIdentity(identity)) errors.push(`Invalid identity ${identity.identityId}`);
  const groups = [
    bundle.trails.map(item => ({ id: item.trailId, signer: item.provenance.authorIdentityId, valid: () => verifyTrail(item, identities.get(item.provenance.authorIdentityId)!) })),
    bundle.events.map(item => ({ id: item.eventId, signer: item.authorIdentityId, valid: () => verifyEvent(item, identities.get(item.authorIdentityId)!) })),
    bundle.reviews.map(item => ({ id: item.reviewId, signer: item.reviewerIdentityId, valid: () => verifyReview(item, identities.get(item.reviewerIdentityId)!) })),
    bundle.forks.map(item => ({ id: item.forkId, signer: item.authorIdentityId, valid: () => verifyFork(item, identities.get(item.authorIdentityId)!) })),
    bundle.tombstones.map(item => ({ id: item.tombstoneId, signer: item.requestedBy, valid: () => verifyTombstone(item, identities.get(item.requestedBy)!) }))
  ];
  for (const group of groups) {
    const ids = new Set<string>();
    for (const item of group) {
      if (ids.has(item.id)) errors.push(`Duplicate record ${item.id}`);
      ids.add(item.id);
      if (!identities.has(item.signer)) errors.push(`Missing identity for ${item.id}`);
      else if (!item.valid()) errors.push(`Invalid record ${item.id}`);
    }
  }
  for (const review of bundle.topicReviews ?? []) {
    const identity = identities.get(review.reviewerIdentityId);
    if (!identity) errors.push(`Missing identity for ${review.reviewId}`);
    else if (!verifyTopicReview(review, identity)) errors.push(`Invalid topic review ${review.reviewId}`);
  }
  for (const topic of bundle.topics ?? []) {
    if (idsDuplicate(topic.topicId, "topicId", bundle.topics ?? [])) errors.push(`Duplicate topic ${topic.topicId}`);
    const identity = identities.get(topic.createdBy);
    if (!identity) errors.push(`Missing identity for ${topic.topicId}`);
    else if (!verifyResearchTopic(topic, identity)) errors.push(`Invalid topic ${topic.topicId}`);
  }
  for (const subproblem of bundle.subproblems ?? []) {
    if (idsDuplicate(subproblem.subproblemId, "subproblemId", bundle.subproblems ?? [])) errors.push(`Duplicate subproblem ${subproblem.subproblemId}`);
    const identity = identities.get(subproblem.createdBy);
    if (!identity) errors.push(`Missing identity for ${subproblem.subproblemId}`);
    else if (!verifyResearchSubproblem(subproblem, identity)) errors.push(`Invalid subproblem ${subproblem.subproblemId}`);
  }
  for (const activity of bundle.topicActivities ?? []) {
    if (idsDuplicate(activity.activityId, "activityId", bundle.topicActivities ?? [])) errors.push(`Duplicate topic activity ${activity.activityId}`);
    const identity = identities.get(activity.authorIdentityId);
    if (!identity) errors.push(`Missing identity for ${activity.activityId}`);
    else if (!verifyTopicActivity(activity, identity) || !verifyTopicActivityGovernance(activity, identities, 1)) errors.push(`Invalid topic activity ${activity.activityId}`);
  }
  for (const change of bundle.membershipChanges ?? []) {
    if (idsDuplicate(change.changeId, "changeId", bundle.membershipChanges ?? [])) errors.push(`Duplicate membership change ${change.changeId}`);
    if (!verifyMembershipChange(change, identities)) errors.push(`Invalid membership change ${change.changeId}`);
  }
  if (bundle.networkPolicy && !verifyNetworkPolicy(bundle.networkPolicy, identities)) errors.push(`Invalid network policy ${bundle.networkPolicy.networkId}`);
  const trailIds = new Set(bundle.trails.map(trail => trail.trailId));
  for (const event of bundle.events) if (!trailIds.has(event.recordId)) errors.push(`Event ${event.eventId} references missing trail`);
  const artifacts = new Map(bundle.artifacts.map(item => [item.cid, item]));
  if (artifacts.size !== bundle.artifacts.length) errors.push("Duplicate artifact");
  for (const [cid, value] of Object.entries(bundle.artifactData ?? {})) {
    try {
      const bytes = decode(value), artifact = artifacts.get(cid);
      if (!artifact || cidFromBytes(bytes) !== cid || artifact.checksum !== cid || artifact.byteSize !== bytes.byteLength) errors.push(`Invalid artifact bytes ${cid}`);
    } catch { errors.push(`Invalid artifact encoding ${cid}`); }
  }
  const topicIds = new Set((bundle.topics ?? []).map(topic => topic.topicId));
  const subproblemIds = new Set((bundle.subproblems ?? []).map(item => item.subproblemId));
  for (const subproblem of bundle.subproblems ?? []) if (!topicIds.has(subproblem.topicId)) errors.push(`Subproblem ${subproblem.subproblemId} references missing topic`);
  for (const activity of bundle.topicActivities ?? []) {
    if (!topicIds.has(activity.topicId)) errors.push(`Topic activity ${activity.activityId} references missing topic`);
    if (activity.subproblemId && !subproblemIds.has(activity.subproblemId)) errors.push(`Topic activity ${activity.activityId} references missing subproblem`);
  }
  for (const review of bundle.topicReviews ?? []) {
    if (!topicIds.has(review.topicId)) errors.push(`Topic review ${review.reviewId} references missing topic`);
    if (review.subproblemId && !subproblemIds.has(review.subproblemId)) errors.push(`Topic review ${review.reviewId} references missing subproblem`);
  }
  for (const trail of bundle.trails) {
    if (trail.topicId && !topicIds.has(trail.topicId)) errors.push(`Trail ${trail.trailId} references missing topic`);
    if (trail.subproblemId && !subproblemIds.has(trail.subproblemId)) errors.push(`Trail ${trail.trailId} references missing subproblem`);
  }
  return { valid: errors.length === 0, errors };
}

function idsDuplicate(id: string, key: string, values: Array<unknown>): boolean {
  return values.filter(value => (value as Record<string, unknown>)[key] === id).length > 1;
}
