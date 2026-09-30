import { sodium, encode, decode } from "./sodium.js";
import { cidFromBytes } from "./cid.js";
import { canonicalBytes } from "./canonical.js";
import type { Identity, IdentityKeyPair, AuthorKind } from "./types.js";
import { identitySchema } from "./model-schema.js";
export const identityIdForKey = (publicKey: string): string => "id-" + cidFromBytes(decode(publicKey));
export function createIdentity(displayName: string, agentOrHuman: AuthorKind = "human", now = new Date().toISOString()): IdentityKeyPair {
  const pair = sodium.crypto_sign_keypair();
  const primaryPublicKey = encode(pair.publicKey);
  return { identity: { identityId: identityIdForKey(primaryPublicKey), primaryPublicKey, keyType: "ed25519", boundPasskeys: [], createdAt: now, rotationChain: [], displayName, agentOrHuman }, privateKey: encode(pair.privateKey) };
}
export function isValidIdentity(identity: Identity): boolean {
  try { return identitySchema.safeParse(identity).success && decode(identity.primaryPublicKey).length === 32 && identity.identityId === identityIdForKey(identity.primaryPublicKey); } catch { return false; }
}
/** Recovery/passkey metadata is local administration data, not public authorship. */
export function publicIdentity(identity: Identity): Identity {
  return {
    identityId: identity.identityId,
    primaryPublicKey: identity.primaryPublicKey,
    keyType: identity.keyType,
    boundPasskeys: [],
    createdAt: identity.createdAt,
    rotationChain: [...identity.rotationChain],
    displayName: identity.displayName,
    agentOrHuman: identity.agentOrHuman,
  };
}
export function signBytes(bytes: Uint8Array, privateKey: string): string { return encode(sodium.crypto_sign_detached(bytes, decode(privateKey))); }
export function verifyBytes(bytes: Uint8Array, signature: string, publicKey: string): boolean {
  try { return sodium.crypto_sign_verify_detached(decode(signature), bytes, decode(publicKey)); } catch { return false; }
}
export function rotateIdentity(previous: Identity, displayName = previous.displayName, now = new Date().toISOString()): IdentityKeyPair {
  const next = createIdentity(displayName, previous.agentOrHuman, now);
  next.identity.rotationChain = [...previous.rotationChain, previous.identityId];
  return next;
}

export interface KeyRotation { previousIdentity: Identity; nextIdentity: Identity; createdAt: string; signature: string; }
export function rotateIdentityWithProof(previous: IdentityKeyPair, now = new Date().toISOString()): { next: IdentityKeyPair; proof: KeyRotation } {
  const next = rotateIdentity(previous.identity, previous.identity.displayName, now);
  const body = { previousIdentity: previous.identity, nextIdentity: next.identity, createdAt: now };
  return { next, proof: { ...body, signature: signBytes(canonicalBytes(body), previous.privateKey) } };
}
export function verifyRotation(proof: KeyRotation): boolean {
  const { signature, ...body } = proof;
  return isValidIdentity(proof.previousIdentity) && isValidIdentity(proof.nextIdentity) && verifyBytes(canonicalBytes(body), signature, proof.previousIdentity.primaryPublicKey);
}
