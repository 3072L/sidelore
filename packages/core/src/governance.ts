import { canonicalBytes } from "./canonical.js";
import { cidFromBytes } from "./cid.js";
import { isValidIdentity, signBytes, verifyBytes } from "./identity.js";
import { forkSchema, reportSchema, reviewSchema, tombstoneSchema, topicReviewSchema } from "./model-schema.js";
import type { Fork, Identity, IdentityKeyPair, Report, Review, Tombstone, TopicReview } from "./types.js";

type SignedValue = Fork | Review | Tombstone | Report | TopicReview;
function unsigned(value: SignedValue): Record<string, unknown> {
  const { signature, tombstoneId, reviewId, forkId, reportId, ...rest } = value as unknown as Record<string, unknown>;
  return rest;
}
function signedId(prefix: string, value: Record<string, unknown>): string {
  return `${prefix}-${cidFromBytes(canonicalBytes(value))}`;
}
function verify(value: SignedValue, identity: Identity, prefix: string, id: string, signer: string): boolean {
  try {
    const body = unsigned(value);
    return isValidIdentity(identity) && signer === identity.identityId && id === signedId(prefix, body)
      && verifyBytes(canonicalBytes(body), value.signature, identity.primaryPublicKey);
  } catch { return false; }
}
export function createSignedTombstone(input: Omit<Tombstone, "tombstoneId" | "requestedBy" | "signature">, author: IdentityKeyPair): Tombstone {
  const body = { ...input, requestedBy: author.identity.identityId };
  return { ...body, tombstoneId: signedId("tomb", body), signature: signBytes(canonicalBytes(body), author.privateKey) };
}
export function verifyTombstone(value: Tombstone, identity: Identity): boolean {
  return tombstoneSchema.safeParse(value).success && verify(value, identity, "tomb", value.tombstoneId, value.requestedBy);
}
export function createSignedReview(input: Omit<Review, "reviewId" | "reviewerIdentityId" | "signature">, reviewer: IdentityKeyPair): Review {
  const body = { ...input, reviewerIdentityId: reviewer.identity.identityId };
  return { ...body, reviewId: signedId("review", body), signature: signBytes(canonicalBytes(body), reviewer.privateKey) };
}
export function verifyReview(value: Review, identity: Identity): boolean {
  return reviewSchema.safeParse(value).success && verify(value, identity, "review", value.reviewId, value.reviewerIdentityId);
}
export function createSignedTopicReview(input: Omit<TopicReview, "reviewId" | "reviewerIdentityId" | "signature">, reviewer: IdentityKeyPair): TopicReview {
  const body = { ...input, reviewerIdentityId: reviewer.identity.identityId };
  return { ...body, reviewId: signedId("topic-review", body), signature: signBytes(canonicalBytes(body), reviewer.privateKey) };
}
export function verifyTopicReview(value: TopicReview, identity: Identity): boolean {
  return topicReviewSchema.safeParse(value).success && verify(value, identity, "topic-review", value.reviewId, value.reviewerIdentityId);
}
export function createSignedFork(input: Omit<Fork, "forkId" | "authorIdentityId" | "signature">, author: IdentityKeyPair): Fork {
  const body = { ...input, authorIdentityId: author.identity.identityId };
  return { ...body, forkId: signedId("fork", body), signature: signBytes(canonicalBytes(body), author.privateKey) };
}
export function verifyFork(value: Fork, identity: Identity): boolean {
  return forkSchema.safeParse(value).success && verify(value, identity, "fork", value.forkId, value.authorIdentityId);
}
export function createSignedReport(input: Omit<Report, "reportId" | "reporterIdentityId" | "signature">, author: IdentityKeyPair): Report {
  const body = { ...input, reporterIdentityId: author.identity.identityId };
  return { ...body, reportId: signedId("report", body), signature: signBytes(canonicalBytes(body), author.privateKey) };
}
export function verifyReport(value: Report, identity: Identity): boolean {
  return reportSchema.safeParse(value).success && verify(value, identity, "report", value.reportId, value.reporterIdentityId);
}
