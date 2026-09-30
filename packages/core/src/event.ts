import { canonicalBytes } from "./canonical.js";
import { cidFromBytes } from "./cid.js";
import { signBytes, verifyBytes, isValidIdentity } from "./identity.js";
import type { Event, EventType, Identity, IdentityKeyPair, UnsignedEvent } from "./types.js";
import { randomUUIDValue } from "./random.js";
import { eventSchema } from "./model-schema.js";

const EVENT_TYPES: ReadonlySet<EventType> = new Set([
  "hypothesis", "experiment", "observation", "failure", "counterexample", "pivot",
  "result", "open_question", "review", "fork", "response", "retraction", "tombstone"
]);

export function unsignedEvent(event: Event): UnsignedEvent {
  const { eventId: _eventId, signature: _signature, contentCid: _contentCid, ...unsigned } = event;
  return unsigned;
}

export function createSignedEvent(
  input: Omit<UnsignedEvent, "authorIdentityId" | "createdAt"> & Partial<Pick<UnsignedEvent, "createdAt">>,
  keyPair: IdentityKeyPair,
  now = new Date().toISOString()
): Event {
  const unsigned: UnsignedEvent = {
    ...input,
    authorIdentityId: keyPair.identity.identityId,
    createdAt: input.createdAt ?? now,
    parentEventIds: [...input.parentEventIds].sort(),
    artifactRefs: input.artifactRefs ?? [],
    citationRefs: input.citationRefs ?? []
  };
  assertUnsignedEvent(unsigned);
  const bytes = canonicalBytes(unsigned);
  const contentCid = cidFromBytes(bytes);
  return {
    ...unsigned,
    eventId: `evt-${contentCid}`,
    contentCid,
    signature: signBytes(bytes, keyPair.privateKey)
  };
}

export function assertUnsignedEvent(event: UnsignedEvent): void {
  if (!event.recordId || !event.authorIdentityId || !event.createdAt) throw new Error("Event identity fields are required");
  if (!event.payload || Array.isArray(event.payload) || typeof event.payload !== "object") throw new Error("Invalid event payload");
  if (Number.isNaN(Date.parse(event.createdAt))) throw new Error("Invalid event date");
  if (!EVENT_TYPES.has(event.eventType)) throw new Error(`Unsupported event type: ${event.eventType}`);
  if (!Array.isArray(event.parentEventIds) || !Array.isArray(event.artifactRefs) || !Array.isArray(event.citationRefs)) {
    throw new Error("Event references must be arrays");
  }
  if (new Set(event.parentEventIds).size !== event.parentEventIds.length) throw new Error("Duplicate parent events");
  if (!["public", "federated", "private"].includes(event.visibility)) throw new Error("Invalid event visibility");
}

export function verifyEvent(event: Event, identity: Identity): boolean {
  try {
    if (!eventSchema.safeParse(event).success || !isValidIdentity(identity) || event.authorIdentityId !== identity.identityId) return false;
    assertUnsignedEvent(unsignedEvent(event));
    const bytes = canonicalBytes(unsignedEvent(event));
    return event.contentCid === cidFromBytes(bytes)
      && event.eventId === `evt-${event.contentCid}`
      && verifyBytes(bytes, event.signature, identity.primaryPublicKey);
  } catch {
    return false;
  }
}

export function createEventId(): string {
  return `evt-draft-${randomUUIDValue()}`;
}
