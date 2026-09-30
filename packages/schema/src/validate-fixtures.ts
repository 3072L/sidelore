import { validateLegacyTrajectory } from "./index.js";
import { createBundle, createIdentity, createSignedEvent, createTrailDraft, verifyBundle } from "../../core/src/index.js";

// Construct fresh synthetic input in memory. Never read a local research database or dataset.
const records = [{
  id: "synthetic-validation", title: "Synthetic schema check", domain: "testing",
  status: "unresolved", abstract: "Generated during validation only.",
  timeline: [{ type: "hypothesis", note: "Synthetic input" }],
  provenance: { source: "In-memory test generator" },
}];
const failures = records.flatMap((record, index) => {
  const result = validateLegacyTrajectory(record);
  return result.valid ? [] : [`record ${index + 1}: ${result.errors.join(", ")}`];
});
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${records.length} generated explorer fixture.`);
}

const author = createIdentity("Synthetic validation identity");
const trail = createTrailDraft({ title: "Synthetic validation trail", domains: ["testing"] }, author);
const event = createSignedEvent({
  recordId: trail.trailId, parentEventIds: [], eventType: "hypothesis",
  payload: { note: "Generated during validation only." }, artifactRefs: [], citationRefs: [], visibility: "public",
}, author);
const bundle = createBundle({ identities: [author.identity], trails: [trail], events: [event], artifacts: [], reviews: [], forks: [], tombstones: [] });
const result = verifyBundle(bundle);
if (!result.valid) {
  console.error(`Generated protocol fixture failed: ${result.errors.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${bundle.trails.length} freshly signed protocol fixture trail.`);
}
