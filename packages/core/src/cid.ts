import { sodium } from "./sodium.js";
import { canonicalBytes } from "./canonical.js";
const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
/** CIDv1(raw, sha2-256), multibase base32. */
export function cidFromBytes(bytes: Uint8Array): string {
  const input = new Uint8Array([1, 0x55, 0x12, 0x20, ...sodium.crypto_hash_sha256(bytes)]);
  let output = "b", buffer = 0, bits = 0;
  for (const byte of input) {
    buffer = (buffer << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(buffer >>> bits) & 31]; }
  }
  if (bits) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}
export const cidFromValue = (value: unknown, serialize = canonicalBytes): string => cidFromBytes(serialize(value));
