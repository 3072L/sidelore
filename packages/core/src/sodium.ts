import sodium from "libsodium-wrappers-sumo";
await sodium.ready;
export { sodium };
export const encode = (value: Uint8Array): string => sodium.to_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
export const decode = (value: string): Uint8Array => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
