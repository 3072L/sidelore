/** Cross-runtime UUID generation for node and browser clients. */
export function randomUUIDValue(): string {
  const runtimeCrypto = globalThis.crypto as Crypto | undefined;
  if (runtimeCrypto?.randomUUID) return runtimeCrypto.randomUUID();
  if (runtimeCrypto?.getRandomValues) {
    const bytes = runtimeCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("A secure random number generator is required");
}
