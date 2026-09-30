import { useEffect, useState } from "react";
import { languages, translationRows } from "./translations.js";
export { languages } from "./translations.js";

export type Locale = (typeof languages)[number]["code"];
export type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;
export const catalog: Record<string, string[]> = Object.fromEntries(
  translationRows
    .trim()
    .split("\n")
    .map((row) => {
      const [key, ...translations] = row.split("|");
      if (
        translations.length !== 3 ||
        translations.some((value) => !value.trim())
      )
        throw new Error(`Incomplete UI translation: ${key}`);
      return [key, translations];
    }),
);
export const statusLabels: Record<string, string> = {
  open: "Open",
  active: "Active",
  blocked: "Blocked",
  solved: "Solved",
  reopened: "Reopened",
  retired: "Retired",
  draft: "Draft",
  negative: "Negative result",
  unresolved: "Unresolved",
  partial: "Partial",
  reframed: "Reframed",
  retracted: "Withdrawn",
  author_claim: "Author claim",
  unverified: "Unverified",
  replicated: "Replicated",
  challenged: "Challenged",
  formally_verified: "Formally verified",
  withdrawn: "Withdrawn",
  seen: "Seen",
  partially_replicated: "Partially replicated",
  corrected: "Corrected",
  not_reproducible: "Not reproducible",
  pending: "Awaiting approval",
  approved: "Approved",
  cancelled: "Cancelled",
  "withdrawal-requested": "Withdrawal requested",
  hypothesis: "Hypothesis",
  experiment: "Experiment",
  observation: "Observation",
  failure: "Failure evidence",
  counterexample: "Counterexample",
  pivot: "Pivot",
  result: "Result",
  open_question: "Open question",
  review: "Review",
  fork: "Branches",
  response: "Response",
  retraction: "Withdrawal",
  tombstone: "Withdrawal",
  attempt_started: "Start an independent attempt",
  handoff_requested: "Request a handoff",
  summary: "Progress summary",
  status_update: "Status update",
  challenge: "Challenge a claim",
  evidence_link: "Evidence note",
  public: "Public network",
  organization: "Organization network",
  local: "Local mode",
};
const warningLabels: Record<string, string> = {
  "A secret-like string may be present.": "A secret-like string may be present. Review it carefully.",
  "An email address or long numeric identifier may be present.":
    "An email address or long numeric identifier may be present. Check for personal information.",
  "No artifact or record license was supplied.":
    "No artifact or record license was supplied.",
  "Artifact exceeds the default 100 MiB review threshold.":
    "Attachments exceed the 100 MiB review threshold.",
  "Attachment exceeds the automatic content inspection limit; human review required.":
    "An attachment exceeds the automatic inspection limit. Review it manually.",
};
export function detectLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const language = preference.toLowerCase();
    if (/^zh(?:-|$)/.test(language)) {
      if (language.includes("hant")) return "zh-TW";
      if (language.includes("hans")) return "zh-CN";
      return /(?:tw|hk|mo)/.test(language) ? "zh-TW" : "zh-CN";
    }
    if (/^en(?:-|$)/.test(language)) return "en";
    if (/^ja(?:-|$)/.test(language)) return "ja";
  }
  return "en";
}
export function translate(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  if (!key) return "";
  const resolved = Object.hasOwn(statusLabels, key)
    ? statusLabels[key]
    : Object.hasOwn(warningLabels, key)
      ? warningLabels[key]
      : key;
  const index = { en: -1, "zh-CN": 0, "zh-TW": 1, ja: 2 }[locale];
  let text =
    index < 0
      ? resolved
      : Object.hasOwn(catalog, resolved)
        ? catalog[resolved][index]
        : resolved;
  if (
    locale === "en" &&
    Number(String(values.count).replaceAll(",", "")) === 1
  ) {
    const singular: Record<string, string> = {
      "{count} bytes": "{count} byte",
      "{count} records": "{count} record",
      "{count} peers": "{count} peer",
      "Includes {count} already-approved dependencies":
        "Includes {count} already-approved dependency",
    };
    text = singular[resolved] ?? text;
  }
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    values[name] === undefined ? placeholder : String(values[name]),
  );
}
function saved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences still work for this session. */
  }
}
export function usePreferences() {
  const [locale, changeLocale] = useState<Locale>(() => {
    const stored = saved("sidelore.locale");
    return languages.some((l) => l.code === stored)
      ? (stored as Locale)
      : detectLocale(navigator.languages);
  });
  const [theme, changeTheme] = useState<"dark" | "light">(() =>
    saved("sidelore.theme") === "light" ? "light" : "dark",
  );
  const tr: Translator = (key, values) => translate(locale, key, values);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `Sidelore · ${translate(locale, "Research commons")}`;
  }, [locale]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101416" : "#f4f5f2");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return {
    locale,
    theme,
    tr,
    setLocale(value: string) {
      if (languages.some((l) => l.code === value)) {
        changeLocale(value as Locale);
        persist("sidelore.locale", value);
      }
    },
    setTheme(value: "dark" | "light") {
      changeTheme(value);
      persist("sidelore.theme", value);
    },
    formatNumber(value: number) {
      return new Intl.NumberFormat(locale).format(value);
    },
    formatDate(value: string) {
      const date = new Date(value);
      return Number.isFinite(date.valueOf())
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(date)
        : "—";
    },
  };
}

/** Localize operator guidance while preserving the original diagnostic in details. */
export function localizeError(message: string, tr: Translator): string {
  const clean = message
    .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
    .replace(/^Error: /, "");
  if (Object.hasOwn(catalog, clean)) return tr(clean);
  if (/vault is locked|unlock.*identity/i.test(clean))
    return tr("Unlock your local identity first.");
  if (/decrypt|passphrase|ciphertext|wrong password/i.test(clean))
    return tr("Check your passphrase and backup file.");
  if (/unapproved dependency|missing record|dependency/i.test(clean))
    return tr("Some references are not approved. Select the required records or prepare a new summary.");
  if (/snapshot changed|no longer pending/i.test(clean))
    return tr("The content changed or is no longer pending. Prepare a new preview.");
  if (/human.only|cannot approve.*manually/i.test(clean))
    return tr("This action requires human authority. Use the local interface.");
  if (/index.*(returned|unavailable|failed)/i.test(clean))
    return tr("The index is unavailable. Check its URL or try again later.");
  if (/network|connect|fetch|dial|timeout/i.test(clean))
    return tr("Connection unavailable. Check your network profile.");
  return tr("This action could not be completed. Check your input or connection and try again.");
}
