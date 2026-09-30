/** Protocol crypto is re-exported from core so clients share one implementation. */
export { createIdentity, signBytes, verifyBytes } from "../../core/src/identity.js";
export { encryptArtifact, decryptArtifact } from "../../core/src/artifact.js";
export { canonicalize, canonicalBytes } from "../../core/src/canonical.js";
export { cidFromBytes, cidFromValue } from "../../core/src/cid.js";
