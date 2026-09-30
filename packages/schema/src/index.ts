import {
  artifactSchema,
  bundleSchema,
  draftSchema,
  eventSchema,
  forkSchema,
  identitySchema,
  reportSchema,
  reviewSchema,
  tombstoneSchema,
  trailSchema,
  topicSchema,
  subproblemSchema,
  topicActivitySchema,
  membershipChangeSchema,
  networkPolicySchema
} from "../../core/src/index.js";

export interface ValidationResult { valid: boolean; errors: string[]; }
function result(value: unknown, schema: { safeParse(input: unknown): { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } }): ValidationResult {
  const parsed = schema.safeParse(value);
  return parsed.success ? { valid: true, errors: [] } : { valid: false, errors: (parsed.error?.issues ?? []).map(issue => `${issue.path.join(".")}: ${issue.message}`) };
}
export const validateIdentity = (value: unknown): ValidationResult => result(value, identitySchema);
export const validateTrail = (value: unknown): ValidationResult => result(value, trailSchema);
export const validateEvent = (value: unknown): ValidationResult => result(value, eventSchema);
export const validateArtifact = (value: unknown): ValidationResult => result(value, artifactSchema);
export const validateReview = (value: unknown): ValidationResult => result(value, reviewSchema);
export const validateFork = (value: unknown): ValidationResult => result(value, forkSchema);
export const validateTombstone = (value: unknown): ValidationResult => result(value, tombstoneSchema);
export const validateReport = (value: unknown): ValidationResult => result(value, reportSchema);
export const validateDraft = (value: unknown): ValidationResult => result(value, draftSchema);
export const validateBundle = (value: unknown): ValidationResult => result(value, bundleSchema);
export const validateTopic = (value: unknown): ValidationResult => result(value, topicSchema);
export const validateSubproblem = (value: unknown): ValidationResult => result(value, subproblemSchema);
export const validateTopicActivity = (value: unknown): ValidationResult => result(value, topicActivitySchema);
export const validateMembershipChange = (value: unknown): ValidationResult => result(value, membershipChangeSchema);
export const validateNetworkPolicy = (value: unknown): ValidationResult => result(value, networkPolicySchema);

/** The first static explorer predates the protocol model; this validates its portable fixture shape. */
export function validateLegacyTrajectory(value: unknown): ValidationResult {
  const errors: string[] = [];
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record !== "object") return { valid: false, errors: ["record must be an object"] };
  for (const field of ["id", "title", "domain", "status", "abstract", "timeline", "provenance"]) {
    if (!(field in record)) errors.push(`missing ${field}`);
  }
  if (!Array.isArray(record.timeline) || record.timeline.length < 1) errors.push("timeline must contain an event");
  return { valid: errors.length === 0, errors };
}
