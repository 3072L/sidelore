/** Deterministic JSON: sorted UTF-16 keys, finite JSON numbers, no silent coercions. */
export function canonicalize(value: unknown): string {
  const active = new Set<object>();
  const visit = (item: unknown): string => {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== "object") throw new TypeError("Expected a JSON value");
    if (active.has(item)) throw new TypeError("Cyclic JSON value");
    active.add(item);
    let output: string;
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length) throw new TypeError("Sparse arrays are not JSON");
      output = "[" + item.map(visit).join(",") + "]";
    } else {
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new TypeError("Expected a plain JSON object");
      const record = item as Record<string, unknown>;
      output = "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + visit(record[key])).join(",") + "}";
    }
    active.delete(item);
    return output;
  };
  return visit(value);
}
export const canonicalBytes = (value: unknown): Uint8Array => new TextEncoder().encode(canonicalize(value));
