import { sodium, encode, decode } from "./sodium.js";
import { cidFromBytes } from "./cid.js";
export interface EncryptedArtifact { bytes: Uint8Array; encryptionMode: "xchacha20-poly1305"; nonce: string; key: string; checksum: string; }
export function encryptArtifact(input: Uint8Array, key: Uint8Array = sodium.randombytes_buf(32)): EncryptedArtifact {
  if (key.length !== 32) throw new Error("Artifact keys must be 32 bytes");
  const nonce = sodium.randombytes_buf(24);
  const bytes = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(input, null, null, nonce, key);
  // The public checksum addresses stored ciphertext; plaintext hashes stay private.
  return { bytes, encryptionMode: "xchacha20-poly1305", nonce: encode(nonce), key: encode(key), checksum: cidFromBytes(bytes) };
}
export function decryptArtifact(input: Pick<EncryptedArtifact, "bytes" | "nonce" | "key">): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, input.bytes, null, decode(input.nonce), decode(input.key));
}
export function wrapArtifactKey(key: string, recipientPublicKey: string): string {
  return encode(sodium.crypto_box_seal(decode(key), sodium.crypto_sign_ed25519_pk_to_curve25519(decode(recipientPublicKey))));
}
export function unwrapArtifactKey(envelope: string, publicKey: string, privateKey: string): string {
  return encode(sodium.crypto_box_seal_open(decode(envelope), sodium.crypto_sign_ed25519_pk_to_curve25519(decode(publicKey)), sodium.crypto_sign_ed25519_sk_to_curve25519(decode(privateKey))));
}
export interface VaultEnvelope { version: 1; salt: string; nonce: string; ciphertext: string; }
export function lockSecret(value: unknown, passphrase: string): VaultEnvelope {
  if (passphrase.length < 10) throw new Error("Use a passphrase of at least 10 characters");
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES), nonce = sodium.randombytes_buf(24);
  const key = sodium.crypto_pwhash(32, passphrase, salt, 2, 64 * 1024 * 1024, sodium.crypto_pwhash_ALG_ARGON2ID13);
  const bytes = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(JSON.stringify(value), null, null, nonce, key);
  sodium.memzero(key);
  return { version: 1, salt: encode(salt), nonce: encode(nonce), ciphertext: encode(bytes) };
}
export function unlockSecret<T>(value: VaultEnvelope, passphrase: string): T {
  if (value.version !== 1) throw new Error("Unsupported vault version");
  const key = sodium.crypto_pwhash(32, passphrase, decode(value.salt), 2, 64 * 1024 * 1024, sodium.crypto_pwhash_ALG_ARGON2ID13);
  try { return JSON.parse(sodium.to_string(sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, decode(value.ciphertext), null, decode(value.nonce), key))) as T; }
  finally { sodium.memzero(key); }
}
