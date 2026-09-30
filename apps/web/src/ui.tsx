import type { PublicationIntent } from "../../../packages/core/src/index.js";
import { localizeError, type Translator } from "./i18n.js";

const paths: Record<string, string> = {
  research:
    "M9 3h6m-5 0v6l-6 9a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-6-9V3M8 14h8",
  publications: "m3 11 18-8-8 18-3-8-7-2Zm7 2L21 3",
  network: "M12 8v5m-7 0h14M5 13v3m14-3v3M9 2h6v6H9zM2 16h6v6H2zM16 16h6v6h-6z",
  settings: "M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Zm-3 9 2 2 4-4",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c4 4 4 14 0 18-4-4-4-14 0-18Z",
  search: "M16 16 21 21M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  check: "m5 12 4 4L19 6",
  moon: "M20 15a9 9 0 0 1-11-11A9 9 0 1 0 20 15Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  note: "M6 3h9l4 4v14H6V3Zm8 0v5h5M9 12h7m-7 4h5",
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  migration: "M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4",
};
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.note} />
    </svg>
  );
}
export function Diagnostic({
  message,
  tr,
}: {
  message: string;
  tr: Translator;
}) {
  return (
    <details className="diagnostic">
      <summary>{localizeError(message, tr)}</summary>
      <pre>{message}</pre>
    </details>
  );
}
export function EmptyState({
  title,
  description,
  icon = "research",
}: {
  title: string;
  description?: string;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}

/** A readable view of the frozen snapshot; the complete signed data stays available. */
export function SnapshotContent({
  intent,
  tr,
}: {
  intent: PublicationIntent;
  tr: Translator;
}) {
  const bundle = intent.snapshot.bundle;
  const sections = [
    [
      "Topic",
      bundle.topics ?? [],
      (r: any) => r.question,
      (r: any) => r.context,
    ],
    [
      "Subproblem",
      bundle.subproblems ?? [],
      (r: any) => r.title,
      (r: any) => r.statement,
    ],
    ["Research attempts", bundle.trails, (r: any) => r.title, (r: any) => r.abstract],
    [
      "Research records",
      bundle.events,
      (r: any) => tr(r.eventType),
      (r: any) =>
        typeof r.payload?.note === "string" &&
        Object.keys(r.payload).length === 1
          ? r.payload.note
          : JSON.stringify(r.payload, null, 2),
    ],
    [
      "Collaboration updates",
      bundle.topicActivities ?? [],
      (r: any) => tr(r.activityType),
      (r: any) =>
        typeof r.payload?.note === "string" &&
        Object.keys(r.payload).length === 1
          ? r.payload.note
          : JSON.stringify(r.payload, null, 2),
    ],
    [
      "Replication & review",
      bundle.topicReviews ?? [],
      (r: any) => tr(r.status),
      (r: any) => [r.method, r.result].filter(Boolean).join("\n\n"),
    ],
    [
      "Review",
      bundle.reviews,
      (r: any) => tr(r.status ?? "Review"),
      (r: any) => JSON.stringify(r, null, 2),
    ],
  ] as const;
  return (
    <div className="snapshot-content">
      {sections.flatMap(([label, records, title, body]) =>
        records.map((r: any, index: number) => (
          <article className="snapshot-record" key={`${label}-${index}`}>
            <small className="eyebrow">{tr(label)}</small>
            <h4>{title(r)}</h4>
            {body(r) && <p>{body(r)}</p>}
          </article>
        )),
      )}
      {!!intent.preview.attachments.length && (
        <div className="attachment-list">
          <h4>{tr("Attachments")}</h4>
          {intent.preview.attachments.map((a) => (
            <div className="attachment" key={a.cid}>
              <Icon name="note" />
              <div>
                <strong>{a.filenames.join(", ") || tr("Unnamed attachment")}</strong>
                <small>{tr("{count} bytes", { count: a.byteSize })}</small>
                <code>{a.cid}</code>
              </div>
            </div>
          ))}
        </div>
      )}
      <details className="technical-details">
        <summary>{tr("Full snapshot & references")}</summary>
        <p>
          {tr("All signed fields, identities, references, and dependencies are included. Approval remains bound to this complete snapshot.")}
        </p>
        <pre>{JSON.stringify(bundle, null, 2)}</pre>
      </details>
    </div>
  );
}
