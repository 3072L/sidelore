import { canonicalBytes } from "./canonical.js";
import { cidFromValue } from "./cid.js";
import { signBytes, verifyBytes, isValidIdentity } from "./identity.js";
import type { Event, Identity, IdentityKeyPair, ResearchObjective, ResearchTrail, TrailStatus, VerificationState, Visibility } from "./types.js";
import { createSignedEvent } from "./event.js";
import { randomUUIDValue } from "./random.js";
import { trailSchema } from "./model-schema.js";
export interface TrailDraftInput {
  title: string; abstract?: string; domains?: string[]; tags?: string[]; visibility?: Visibility; status?: TrailStatus; license?: string;
  topicId?: string; subproblemId?: string; objective?: ResearchObjective; verificationState?: VerificationState; verificationEvidenceIds?: string[];
}
export function trailDefinition(trail: ResearchTrail) {
  return { trailId: trail.trailId, title: trail.title, abstract: trail.abstract, domains: trail.domains, tags: trail.tags,
    visibility: trail.visibility, initialStatus: trail.initialStatus,
    ...(trail.topicId ? { topicId: trail.topicId } : {}), ...(trail.subproblemId ? { subproblemId: trail.subproblemId } : {}),
    ...(trail.objective ? { objective: trail.objective } : {}), ...(trail.verificationState ? { verificationState: trail.verificationState } : {}),
    ...(trail.verificationEvidenceIds ? { verificationEvidenceIds: trail.verificationEvidenceIds } : {}),
    authorIdentityId: trail.provenance.authorIdentityId, createdAt: trail.provenance.createdAt, license: trail.provenance.license ?? "CC BY 4.0" };
}
export function createTrailDraft(input: TrailDraftInput, author: IdentityKeyPair, now = new Date().toISOString()): ResearchTrail {
  if (!input.title.trim()) throw new Error("A trail title is required");
  const trail: ResearchTrail = {
    trailId: "trail-" + randomUUIDValue(), title: input.title.trim(), abstract: input.abstract?.trim() ?? "",
    domains: input.domains ?? [], tags: input.tags ?? [], headEventIds: [], status: input.status ?? "draft", initialStatus: input.status ?? "draft",
    visibility: input.visibility ?? "public", contributors: [author.identity.identityId], artifactManifest: [], citationIndex: [], reviewSummary: {},
    provenance: { authorIdentityId: author.identity.identityId, authorType: author.identity.agentOrHuman, recordedBy: author.identity.displayName, createdAt: now, updatedAt: now, signatureStatus: "unverified", license: input.license ?? "CC BY 4.0" },
    ...(input.topicId ? { topicId: input.topicId } : {}), ...(input.subproblemId ? { subproblemId: input.subproblemId } : {}),
    ...(input.objective ? { objective: input.objective } : {}), verificationState: input.verificationState ?? "author_claim",
    ...(input.verificationEvidenceIds ? { verificationEvidenceIds: input.verificationEvidenceIds } : {}),
    contentCid: "", signature: ""
  };
  const body = trailDefinition(trail);
  trail.contentCid = cidFromValue(body); trail.signature = signBytes(canonicalBytes(body), author.privateKey);
  return trail;
}
export function verifyTrail(trail: ResearchTrail, identity: Identity): boolean {
  try { const body = trailDefinition(trail); return trailSchema.safeParse(trail).success && isValidIdentity(identity) && identity.identityId === trail.provenance.authorIdentityId && trail.contentCid === cidFromValue(body) && verifyBytes(canonicalBytes(body), trail.signature, identity.primaryPublicKey); }
  catch { return false; }
}
export function projectTrail(trail: ResearchTrail, events: Event[]): ResearchTrail {
  events = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.eventId.localeCompare(b.eventId));
  const parents = new Set(events.flatMap(event => event.parentEventIds));
  const refs = new Map(events.flatMap(event => event.artifactRefs).map(ref => [ref.cid, ref]));
  const heads = events.filter(event => !parents.has(event.eventId));
  const outcome = events.map(event => event.payload.trailStatus).filter(status => ["active", "negative", "unresolved", "partial", "reframed"].includes(String(status))).at(-1) as TrailStatus | undefined;
  return { ...trail, headEventIds: heads.map(event => event.eventId).sort(),
    status: outcome ?? (trail.initialStatus === "draft" && events.length ? "active" : trail.initialStatus), reviewSummary: {},
    contributors: [...new Set([trail.provenance.authorIdentityId, ...events.map(event => event.authorIdentityId)])].sort(),
    artifactManifest: [...refs.values()].sort((a, b) => a.cid.localeCompare(b.cid)),
    citationIndex: events.flatMap(event => event.citationRefs),
    provenance: { ...trail.provenance, signatureStatus: "valid", updatedAt: [trail.provenance.createdAt, ...events.map(event => event.createdAt)].sort().at(-1)! } };
}
export function appendTrailEvent(trail: ResearchTrail, event: Event): ResearchTrail {
  if (event.recordId !== trail.trailId) throw new Error("Event belongs to another trail");
  return { ...trail, headEventIds: [...new Set([...trail.headEventIds.filter(id => !event.parentEventIds.includes(id)), event.eventId])].sort(), status: trail.status === "draft" ? "active" : trail.status,
    provenance: { ...trail.provenance, updatedAt: [trail.provenance.updatedAt, event.createdAt].sort().at(-1)! } };
}
export function createFirstEvent(trail: ResearchTrail, eventType: Event["eventType"], payload: Record<string, unknown>, author: IdentityKeyPair, now?: string): Event {
  return createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType, payload, artifactRefs: [], citationRefs: [], visibility: trail.visibility, license: trail.provenance.license ?? "CC BY 4.0" }, author, now);
}
