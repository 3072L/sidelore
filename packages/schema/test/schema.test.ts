import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdentity, createSignedEvent, createTrailDraft } from "../../core/src/index.js";
import { validateBundle, validateEvent, validateTrail } from "../src/index.js";

test("protocol schemas validate signed records and reject incomplete values", () => {
  const author = createIdentity("Schema author", "human", "2026-09-28T00:00:00.000Z");
  const trail = createTrailDraft({ title: "Schema trail" }, author, "2026-09-28T00:00:00.000Z");
  const event = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "hypothesis", payload: { note: "synthetic" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author, "2026-09-28T00:00:00.000Z");
  assert.equal(validateTrail(trail).valid, true);
  assert.equal(validateEvent(event).valid, true);
  assert.equal(validateTrail({ ...trail, signature: undefined }).valid, false);
  assert.equal(validateBundle({ format: "sidelore.bundle", version: 1, exportedAt: "2026-09-28T00:00:00.000Z", identities: [author.identity], trails: [trail], events: [event], artifacts: [], reviews: [], forks: [], tombstones: [] }).valid, true);
});
