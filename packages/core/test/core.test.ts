import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalize,
  cidFromValue,
  createIdentity,
  createSignedEvent,
  createTrailDraft,
  decryptArtifact,
  encryptArtifact,
  verifyEvent,
  createBundle,
  verifyBundle,
  createSignedTombstone,
  verifyTombstone,
  scanPublication,
  verifyTrail,
  rotateIdentityWithProof,
  verifyRotation,
  createResearchTopic,
  createResearchSubproblem,
  createTopicActivity,
  verifyTopicActivityGovernance,
  createMembershipChange,
  verifyMembershipChange,
  createNetworkPolicy,
  verifyNetworkPolicy,
  createSignedTopicReview,
  verifyTopicReview
} from "../src/index.js";

test("canonical JSON and CID are stable across object key order", () => {
  assert.equal(canonicalize({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(cidFromValue({ b: 2, a: 1 }, (value) => new TextEncoder().encode(canonicalize(value))), cidFromValue({ a: 1, b: 2 }, (value) => new TextEncoder().encode(canonicalize(value))));
});

test("signed events verify and detect payload tampering", () => {
  const author = createIdentity("Test researcher");
  const event = createSignedEvent({ recordId: "trail-test", parentEventIds: [], eventType: "hypothesis", payload: { question: "Can this be reproduced?" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author, "2026-09-28T00:00:00.000Z");
  assert.equal(verifyEvent(event, author.identity), true);
  assert.equal(verifyEvent({ ...event, payload: { question: "changed" } }, author.identity), false);
  assert.notEqual(event.contentCid, createSignedEvent({ recordId: "trail-test", parentEventIds: [], eventType: "hypothesis", payload: { question: "changed" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author, "2026-09-28T00:00:00.000Z").contentCid);
});

test("artifact encryption authenticates and round trips", () => {
  const input = new TextEncoder().encode("synthetic artifact");
  const encrypted = encryptArtifact(input);
  assert.deepEqual(decryptArtifact(encrypted), input);
  encrypted.bytes[0] ^= 1;
  assert.throws(() => decryptArtifact(encrypted));
});

test("a bundle verifies its event signatures", () => {
  const author = createIdentity("Bundle author");
  const trail = createTrailDraft({ title: "Bundle fixture", domains: ["testing"] }, author, "2026-09-28T00:00:00.000Z");
  const event = createSignedEvent({ recordId: trail.trailId, parentEventIds: [], eventType: "result", payload: { outcome: "partial" }, artifactRefs: [], citationRefs: [], visibility: "public" }, author, "2026-09-28T00:00:00.000Z");
  const result = verifyBundle(createBundle({ identities: [author.identity], trails: [trail], events: [event], artifacts: [], reviews: [], forks: [], tombstones: [] }));
  assert.equal(result.valid, true);
});

test("withdrawals are signed append-only governance records", () => {
  const author = createIdentity("Governance author");
  const tombstone = createSignedTombstone({ targetType: "trail", targetId: "trail-private", reason: "privacy", createdAt: "2026-09-28T00:00:00.000Z" }, author);
  assert.equal(verifyTombstone(tombstone, author.identity), true);
  assert.equal(verifyTombstone({ ...tombstone, reason: "copyright" }, author.identity), false);
});

test("publication scan is advisory and public by default", () => {
  const scan = scanPublication({ text: "api_key=super-secret-value-123", artifactBytes: 1 });
  assert.equal(scan.visibility, "public");
  assert.equal(scan.recommendation, "review_warnings");
  assert.ok(scan.warnings.some((warning) => warning.kind === "possible_secret"));
});

test("trail projection and identity rotation carry verifiable provenance", () => {
  const author = createIdentity("Rotating author");
  const trail = createTrailDraft({ title: "Signed trail" }, author, "2026-09-28T00:00:00.000Z");
  assert.equal(verifyTrail(trail, author.identity), true);
  assert.equal(verifyTrail({ ...trail, title: "tampered" }, author.identity), false);
  const rotation = rotateIdentityWithProof(author, "2026-09-29T00:00:00.000Z");
  assert.equal(verifyRotation(rotation.proof), true);
});

test("topics keep objective coordination and verification governance signed", () => {
  const owner = createIdentity("Topic owner");
  const reviewer = createIdentity("Topic reviewer", "agent");
  const topic = createResearchTopic({ question: "Can the conjecture be proved?", successCriteria: ["proof or counterexample"], governancePolicy: { requiredSignatures: 2, allowedMembers: [owner.identity.identityId, reviewer.identity.identityId] } }, owner, "2026-09-28T00:00:00.000Z");
  const subproblem = createResearchSubproblem({ topicId: topic.topicId, title: "Base case", statement: "Close the first obstruction." }, owner, "2026-09-28T00:00:01.000Z");
  const activity = createTopicActivity({ topicId: topic.topicId, subproblemId: subproblem.subproblemId, activityType: "status_update", payload: { topicStatus: "active" }, approvalSigners: [reviewer] }, owner, "2026-09-28T00:00:02.000Z");
  assert.equal(verifyTopicActivityGovernance(activity, [owner.identity, reviewer.identity], 2, topic.governancePolicy.allowedMembers), true);
  assert.equal(verifyTopicActivityGovernance({ ...activity, governanceApprovals: [{ ...activity.governanceApprovals![0], signature: "tampered" }] }, [owner.identity, reviewer.identity], 2), false);
  const grant = createMembershipChange({ networkId: "org-test", memberIdentityId: reviewer.identity.identityId, action: "grant", requiredSignatures: 1 }, [owner], "2026-09-28T00:00:03.000Z");
  assert.equal(verifyMembershipChange(grant, [owner.identity, reviewer.identity]), true);
  const policy = createNetworkPolicy({ networkId: "org-test", mode: "isolated", bridgeEnabled: true }, owner, "2026-09-28T00:00:04.000Z");
  assert.equal(verifyNetworkPolicy(policy, [owner.identity]), true);
  const topicReview = createSignedTopicReview({ topicId: topic.topicId, subproblemId: subproblem.subproblemId, status: "challenged", method: "independent check", result: "Needs another proof", createdAt: "2026-09-28T00:00:05.000Z" }, reviewer);
  assert.equal(verifyTopicReview(topicReview, reviewer.identity), true);
  assert.equal(verifyBundle(createBundle({ identities: [owner.identity, reviewer.identity], trails: [], events: [], artifacts: [], reviews: [], forks: [], tombstones: [], topics: [topic], subproblems: [subproblem], topicActivities: [activity], topicReviews: [topicReview], membershipChanges: [grant], networkPolicy: policy })).valid, true);
});
