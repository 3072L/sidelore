import { canonicalBytes } from "./canonical.js";
import { cidFromBytes } from "./cid.js";
import { isValidIdentity, signBytes, verifyBytes } from "./identity.js";
import { randomUUIDValue } from "./random.js";
import {
  membershipChangeSchema, networkPolicySchema, subproblemSchema, topicActivitySchema, topicSchema
} from "./model-schema.js";
import type {
  Identity, IdentityKeyPair, MembershipApproval, MembershipChange, NetworkPolicy,
  ResearchSubproblem, ResearchTopic, TopicActivity, TopicActivityType, TopicStatus, SubproblemStatus, VerificationState, Visibility
} from "./types.js";

function signedId(prefix: string, body: Record<string, unknown>): string {
  return `${prefix}-${cidFromBytes(canonicalBytes(body))}`;
}

export interface TopicInput {
  question: string;
  context?: string;
  domains?: string[];
  tags?: string[];
  successCriteria?: string[];
  status?: TopicStatus;
  visibility?: Visibility;
  maintainers?: string[];
  governancePolicy?: { requiredSignatures?: number; allowedMembers?: string[] };
}

export function topicDefinition(topic: ResearchTopic): Record<string, unknown> {
  const { contentCid: _contentCid, signature: _signature, derivedStatus: _derivedStatus, ...body } = topic;
  return body;
}

export function createResearchTopic(input: TopicInput, author: IdentityKeyPair, now = new Date().toISOString()): ResearchTopic {
  if (!input.question.trim()) throw new Error("A topic question is required");
  const body = {
    topicId: `topic-${randomUUIDValue()}`,
    question: input.question.trim(), context: input.context?.trim() ?? "", domains: input.domains ?? [], tags: input.tags ?? [],
    successCriteria: input.successCriteria ?? [], status: input.status ?? "open", visibility: input.visibility ?? "public",
    maintainers: input.maintainers?.length ? input.maintainers : [author.identity.identityId],
    governancePolicy: { requiredSignatures: input.governancePolicy?.requiredSignatures ?? 1, ...(input.governancePolicy?.allowedMembers ? { allowedMembers: input.governancePolicy.allowedMembers } : {}) },
    createdAt: now, updatedAt: now, createdBy: author.identity.identityId
  } satisfies Omit<ResearchTopic, "contentCid" | "signature">;
  const contentCid = cidFromBytes(canonicalBytes(body));
  return { ...body, contentCid, signature: signBytes(canonicalBytes(body), author.privateKey) };
}

export function verifyResearchTopic(topic: ResearchTopic, identity: Identity): boolean {
  try {
    const body = topicDefinition(topic);
    return topicSchema.safeParse(topic).success && isValidIdentity(identity) && identity.identityId === topic.createdBy
      && topic.contentCid === cidFromBytes(canonicalBytes(body))
      && verifyBytes(canonicalBytes(body), topic.signature, identity.primaryPublicKey);
  } catch { return false; }
}

/** Derives a display view from signed activities without rewriting the signed topic definition. */
export function projectTopic(topic: ResearchTopic, activities: TopicActivity[]): ResearchTopic {
  const ordered = [...activities].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.activityId.localeCompare(b.activityId));
  const status = [...ordered].reverse().map(activity => activity.activityType === "status_update" ? activity.payload.topicStatus : undefined)
    .find(value => ["open", "active", "blocked", "solved", "reopened", "retired"].includes(String(value))) as TopicStatus | undefined;
  return { ...topic, ...(status ? { derivedStatus: status } : {}) };
}

export function projectSubproblem(subproblem: ResearchSubproblem, activities: TopicActivity[]): ResearchSubproblem {
  const related = activities.filter(activity => activity.subproblemId === subproblem.subproblemId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.activityId.localeCompare(b.activityId));
  const status = [...related].reverse().map(activity => activity.activityType === "status_update" ? activity.payload.subproblemStatus : undefined)
    .find(value => ["open", "active", "blocked", "solved", "reopened"].includes(String(value))) as SubproblemStatus | undefined;
  return { ...subproblem, ...(status ? { derivedStatus: status } : {}) };
}

export interface SubproblemInput {
  topicId: string;
  title: string;
  statement: string;
  constraints?: string[];
  dependsOn?: string[];
  status?: SubproblemStatus;
  participantIds?: string[];
  linkedTrailIds?: string[];
}

export function subproblemDefinition(subproblem: ResearchSubproblem): Record<string, unknown> {
  const { contentCid: _contentCid, signature: _signature, derivedStatus: _derivedStatus, ...body } = subproblem;
  return body;
}

export function createResearchSubproblem(input: SubproblemInput, author: IdentityKeyPair, now = new Date().toISOString()): ResearchSubproblem {
  if (!input.title.trim() || !input.statement.trim()) throw new Error("A subproblem title and statement are required");
  const body = {
    subproblemId: `subproblem-${randomUUIDValue()}`, topicId: input.topicId, title: input.title.trim(), statement: input.statement.trim(),
    constraints: input.constraints ?? [], dependsOn: input.dependsOn ?? [], status: input.status ?? "open",
    participantIds: input.participantIds ?? [author.identity.identityId], linkedTrailIds: input.linkedTrailIds ?? [],
    createdAt: now, updatedAt: now, createdBy: author.identity.identityId
  } satisfies Omit<ResearchSubproblem, "contentCid" | "signature">;
  const contentCid = cidFromBytes(canonicalBytes(body));
  return { ...body, contentCid, signature: signBytes(canonicalBytes(body), author.privateKey) };
}

export function verifyResearchSubproblem(subproblem: ResearchSubproblem, identity: Identity): boolean {
  try {
    const body = subproblemDefinition(subproblem);
    return subproblemSchema.safeParse(subproblem).success && isValidIdentity(identity) && identity.identityId === subproblem.createdBy
      && subproblem.contentCid === cidFromBytes(canonicalBytes(body))
      && verifyBytes(canonicalBytes(body), subproblem.signature, identity.primaryPublicKey);
  } catch { return false; }
}

export interface TopicActivityInput {
  topicId: string;
  subproblemId?: string;
  activityType: TopicActivityType;
  payload: Record<string, unknown>;
  visibility?: Visibility;
  verificationState?: VerificationState;
  approvalSigners?: IdentityKeyPair[];
}

export function topicActivityDefinition(activity: TopicActivity): Record<string, unknown> {
  const { contentCid: _contentCid, signature: _signature, governanceApprovals: _governanceApprovals, ...body } = activity;
  return body;
}

export function createTopicActivity(input: TopicActivityInput, author: IdentityKeyPair, now = new Date().toISOString()): TopicActivity {
  const body = {
    activityId: `activity-${randomUUIDValue()}`, topicId: input.topicId, ...(input.subproblemId ? { subproblemId: input.subproblemId } : {}),
    activityType: input.activityType, payload: input.payload, authorIdentityId: author.identity.identityId,
    visibility: input.visibility ?? "public", verificationState: input.verificationState ?? "unverified", createdAt: now
  } satisfies Omit<TopicActivity, "contentCid" | "signature">;
  const contentCid = cidFromBytes(canonicalBytes(body));
  const governanceApprovals = input.approvalSigners?.length ? approvalsFor(body, input.approvalSigners) : undefined;
  return { ...body, contentCid, signature: signBytes(canonicalBytes(body), author.privateKey), ...(governanceApprovals ? { governanceApprovals } : {}) };
}

export function verifyTopicActivity(activity: TopicActivity, identity: Identity): boolean {
  try {
    const body = topicActivityDefinition(activity);
    return topicActivitySchema.safeParse(activity).success && isValidIdentity(identity) && identity.identityId === activity.authorIdentityId
      && activity.contentCid === cidFromBytes(canonicalBytes(body))
      && verifyBytes(canonicalBytes(body), activity.signature, identity.primaryPublicKey);
  } catch { return false; }
}

export function verifyTopicActivityGovernance(
  activity: TopicActivity,
  identities: Identity[] | Map<string, Identity>,
  requiredSignatures: number,
  allowedMembers?: string[]
): boolean {
  try {
    if (!verifyTopicActivity(activity, (identities instanceof Map ? identities : new Map(identities.map(identity => [identity.identityId, identity]))).get(activity.authorIdentityId)!)) return false;
    const lookup = identities instanceof Map ? identities : new Map(identities.map(identity => [identity.identityId, identity]));
    const body = topicActivityDefinition(activity);
    const signerIds = new Set([activity.authorIdentityId]);
    for (const approval of activity.governanceApprovals ?? []) {
      if (signerIds.has(approval.identityId)) continue;
      const identity = lookup.get(approval.identityId);
      if (identity && isValidIdentity(identity) && verifyBytes(canonicalBytes(body), approval.signature, identity.primaryPublicKey)) signerIds.add(approval.identityId);
    }
    return signerIds.size >= requiredSignatures && (!allowedMembers?.length || [...signerIds].every(identityId => allowedMembers.includes(identityId)));
  } catch { return false; }
}

function membershipBody(change: MembershipChange): Record<string, unknown> {
  const { approvals: _approvals, contentCid: _contentCid, ...body } = change;
  return body;
}

function policyBody(policy: NetworkPolicy): Record<string, unknown> {
  const { approvals: _approvals, contentCid: _contentCid, ...body } = policy;
  return body;
}

function approvalsFor(body: Record<string, unknown>, signers: IdentityKeyPair[]): MembershipApproval[] {
  const seen = new Set<string>();
  return signers.filter(signer => {
    if (seen.has(signer.identity.identityId)) return false;
    seen.add(signer.identity.identityId);
    return true;
  }).map(signer => ({ identityId: signer.identity.identityId, signature: signBytes(canonicalBytes(body), signer.privateKey) }));
}

export interface MembershipChangeInput {
  networkId: string;
  memberIdentityId: string;
  action: "grant" | "revoke";
  roles?: string[];
  reason?: string;
  requiredSignatures?: number;
}

export function createMembershipChange(input: MembershipChangeInput, signers: IdentityKeyPair[], now = new Date().toISOString()): MembershipChange {
  if (!signers.length) throw new Error("At least one membership signer is required");
  if (signers.length < (input.requiredSignatures ?? 1)) throw new Error("Membership signer count is below the required threshold");
  const body = {
    changeId: "", networkId: input.networkId, memberIdentityId: input.memberIdentityId, action: input.action,
    roles: input.roles ?? [], ...(input.reason ? { reason: input.reason } : {}), requiredSignatures: input.requiredSignatures ?? 1, createdAt: now
  } satisfies Omit<MembershipChange, "contentCid" | "approvals">;
  const { changeId: _changeId, ...idBody } = body;
  body.changeId = signedId("membership", idBody);
  const contentCid = cidFromBytes(canonicalBytes(body));
  return { ...body, contentCid, approvals: approvalsFor(body, signers) };
}

export function verifyMembershipChange(change: MembershipChange, identities: Identity[] | Map<string, Identity>): boolean {
  try {
    if (!membershipChangeSchema.safeParse(change).success) return false;
    const body = membershipBody(change);
    if (change.contentCid !== cidFromBytes(canonicalBytes(body)) || change.requiredSignatures > change.approvals.length) return false;
    const lookup = identities instanceof Map ? identities : new Map(identities.map(identity => [identity.identityId, identity]));
    const seen = new Set<string>();
    let valid = 0;
    for (const approval of change.approvals) {
      if (seen.has(approval.identityId)) continue;
      const identity = lookup.get(approval.identityId);
      if (identity && isValidIdentity(identity) && verifyBytes(canonicalBytes(body), approval.signature, identity.primaryPublicKey)) { seen.add(approval.identityId); valid++; }
    }
    return valid >= change.requiredSignatures;
  } catch { return false; }
}

export interface NetworkPolicyInput {
  networkId: string;
  mode?: "isolated" | "federated";
  directoryEnabled?: boolean;
  bridgeEnabled?: boolean;
  requiredSignatures?: number;
}

export function createNetworkPolicy(input: NetworkPolicyInput, signer: IdentityKeyPair | IdentityKeyPair[], now = new Date().toISOString()): NetworkPolicy {
  const signers = Array.isArray(signer) ? signer : [signer];
  if (!signers.length) throw new Error("At least one policy signer is required");
  if (signers.length < (input.requiredSignatures ?? 1)) throw new Error("Policy signer count is below the required threshold");
  const body = {
    networkId: input.networkId, mode: input.mode ?? "isolated", directoryEnabled: input.directoryEnabled ?? false,
    bridgeEnabled: input.bridgeEnabled ?? false, requiredSignatures: input.requiredSignatures ?? 1,
    createdAt: now, updatedAt: now, updatedBy: signers[0].identity.identityId
  } satisfies Omit<NetworkPolicy, "contentCid" | "approvals">;
  const contentCid = cidFromBytes(canonicalBytes(body));
  return { ...body, contentCid, approvals: approvalsFor(body, signers) };
}

export function verifyNetworkPolicy(policy: NetworkPolicy, identities: Identity[] | Map<string, Identity>): boolean {
  try {
    if (!networkPolicySchema.safeParse(policy).success) return false;
    const body = policyBody(policy);
    if (policy.contentCid !== cidFromBytes(canonicalBytes(body)) || policy.requiredSignatures > policy.approvals.length) return false;
    const lookup = identities instanceof Map ? identities : new Map(identities.map(identity => [identity.identityId, identity]));
    const seen = new Set<string>();
    let valid = 0;
    for (const approval of policy.approvals) {
      if (seen.has(approval.identityId)) continue;
      const identity = lookup.get(approval.identityId);
      if (identity && isValidIdentity(identity) && verifyBytes(canonicalBytes(body), approval.signature, identity.primaryPublicKey)) { seen.add(approval.identityId); valid++; }
    }
    return valid >= policy.requiredSignatures;
  } catch { return false; }
}
