export type RiskKind = "possible_secret" | "possible_personal_data" | "missing_license" | "large_artifact";

export interface RiskWarning {
  kind: RiskKind;
  message: string;
  location?: string;
}

export interface PublicationScan {
  warnings: RiskWarning[];
  recommendation: "publish_with_review" | "review_warnings";
  visibility: "public" | "federated" | "private";
}

/** Advisory only: authors remain the final publisher, including for public trails. */
export function scanPublication(input: { text?: string; license?: string; visibility?: "public" | "federated" | "private"; artifactBytes?: number }): PublicationScan {
  const warnings: RiskWarning[] = [];
  const text = input.text ?? "";
  if (/(?:sk|pk|api[_-]?key|secret|token)[=:][A-Za-z0-9_\-]{12,}/i.test(text)) warnings.push({ kind: "possible_secret", message: "A secret-like string may be present." });
  if (/(?:["']?(?:api[_-]?key|secret|token|password)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-/+]{12,}|\bsk-[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(text)
    && !warnings.some(w => w.kind === "possible_secret")) warnings.push({ kind: "possible_secret", message: "A secret-like string may be present." });
  if (/(?:\b\d{15,19}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(text)) warnings.push({ kind: "possible_personal_data", message: "An email address or long numeric identifier may be present." });
  if (!input.license?.trim()) warnings.push({ kind: "missing_license", message: "No artifact or record license was supplied." });
  if ((input.artifactBytes ?? 0) > 100 * 1024 * 1024) warnings.push({ kind: "large_artifact", message: "Artifact exceeds the default 100 MiB review threshold." });
  return { warnings, recommendation: warnings.length ? "review_warnings" : "publish_with_review", visibility: input.visibility ?? "public" };
}
