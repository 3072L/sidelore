import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type {
  NetworkProfile,
  PublicationIntent,
  ResearchTopic,
  TopicSubscription,
} from "../../../packages/core/src/index.js";
import {
  topicShareLink,
  parseTopicShareLink,
} from "../../../packages/core/src/share-link.js";
import {
  loadBrowserIdentity,
  clearMigratedBrowserIdentity,
} from "./local-store.js";
import { usePreferences, languages, localizeError } from "./i18n.js";
import { Icon, EmptyState, SnapshotContent, Diagnostic } from "./ui.js";
import "./styles.css";

declare global {
  interface Window {
    sidelore?: { call(method: string, args?: unknown): Promise<any> };
  }
}
const desktop = !!window.sidelore;
if (!desktop && "serviceWorker" in navigator)
  void navigator.serviceWorker
    .register("/service-worker.js")
    .catch(() => undefined);
const call = (method: string, args: unknown = {}) => {
  if (!window.sidelore)
    return Promise.reject(new Error("Use the local research client for this action."));
  return window.sidelore.call(method, args);
};
const values = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
};
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const labels: Record<string, string> = {
  topics: "Topic",
  subproblems: "Subproblem",
  trails: "Research attempts",
  events: "Research records",
  topicActivities: "Collaboration updates",
  topicReviews: "Replication & review",
  reviews: "Review",
  artifacts: "Attachments",
  forks: "Branches",
  tombstones: "Withdrawal",
};
function App() {
  const { locale, setLocale, tr, theme, setTheme, formatDate, formatNumber } =
    usePreferences();
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState("research"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState<any>({ locked: true }),
    [network, setNetwork] = useState<any>({ connected: false });
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]),
    [networkId, setNetworkId] = useState("");
  const [topics, setTopics] = useState<ResearchTopic[]>([]),
    [topicId, setTopicId] = useState(""),
    [detail, setDetail] = useState<any>();
  const [subscriptions, setSubscriptions] = useState<TopicSubscription[]>([]),
    [workspaces, setWorkspaces] = useState<any[]>([]),
    [workspaceId, setWorkspaceId] = useState("local");
  const [catalog, setCatalog] = useState<any[]>([]),
    [selection, setSelection] = useState<string[]>([]),
    [intents, setIntents] = useState<PublicationIntent[]>([]),
    [preview, setPreview] = useState<PublicationIntent>();
  const [confirmed, setConfirmed] = useState(false),
    [kind, setKind] = useState("topic"),
    [grants, setGrants] = useState<any[]>([]),
    [agentCredential, setAgentCredential] = useState<any>();
  const [query, setQuery] = useState(""),
    [sources, setSources] = useState<any[]>([]),
    [indexUrl, setIndexUrl] = useState(
      location.protocol.startsWith("http") ? location.origin : "",
    );
  const [legacy, setLegacy] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  async function refresh() {
    if (!desktop) return;
    const [id, net, nets, research, subs, spaces, queue, rows, gs] =
      await Promise.all([
        call("identity.status"),
        call("network.status"),
        call("network.list"),
        call("research.list"),
        call("subscription.list"),
        call("workspace.list"),
        call("publication.list"),
        call("research.catalog", { workspaceId }),
        call("grant.list"),
      ]);
    setIdentity(id);
    setNetwork(net);
    setProfiles(nets);
    setTopics(research.topics ?? []);
    setSubscriptions(subs);
    setWorkspaces(spaces);
    setIntents(queue);
    setCatalog(rows);
    setGrants(gs);
    setNetworkId(
      (current) =>
        current ||
        net.networkId ||
        nets.find((n: NetworkProfile) => n.kind !== "local")?.networkId ||
        "",
    );
    if (topicId) setDetail(await call("research.topic", { topicId }));
  }
  async function run(operation: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      await operation();
      await refresh();
      if (success) setMessage(success);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  function reportError(error: unknown) {
    setFailed(true);
    setMessage(error instanceof Error ? error.message : String(error));
  }
  useEffect(() => {
    void refresh().catch(reportError);
    void loadBrowserIdentity().then((v) => setLegacy(!!v));
  }, [workspaceId]);
  useEffect(() => {
    if (!desktop) return;
    const timer = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 6000);
    return () => clearInterval(timer);
  }, [topicId, workspaceId]);
  useEffect(() => {
    if (topicId && desktop)
      void call("research.topic", { topicId })
        .then(setDetail)
        .catch(reportError);
  }, [topicId]);
  async function search() {
    if (desktop) {
      const found = await call("network.search", { query });
      setSources(found);
    } else {
      const u = new URL("/v1/topics", indexUrl);
      u.searchParams.set("q", query);
      const response = await fetch(u);
      if (!response.ok) throw new Error(`Index returned ${response.status}`);
      const body = await response.json();
      const health = await (
        await fetch(new URL("/v1/health", indexUrl))
      ).json();
      setNetworkId(health.networkId);
      setTopics(body.topics ?? []);
      setSources([{ source: u.origin, topics: body.topics ?? [] }]);
    }
  }
  const currentProfile = profiles.find((p) => p.networkId === networkId);
  const selectedSubscription = subscriptions.find(
    (s) => s.topicId === topicId && s.networkId === networkId,
  );
  const pageCopy: Record<string, [string, string]> = {
    research: ["Research workspace", "Every attempt moves the question forward."],
    publications: ["Publication queue", "Review your work before sharing it with the commons."],
    network: ["Network & subscriptions", "Connect with peers. Follow questions worth pursuing."],
    settings: ["Identity & agents", "Manage your identity, workspaces, and research assistants."],
    migration: ["Migrate identity", "Keep your research identity with you."],
  };
  const startResearch = () => {
    setKind("topic");
    document
      .getElementById("composer")
      ?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLInputElement>('input[name="question"]')
          ?.focus({ preventScroll: true }),
      100,
    );
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {tr("Skip to content")}
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={() => setTab("research")}
          aria-label="Sidelore"
        >
          <span className="brand-mark">
            <Icon name="research" />
          </span>
          <span>
            sidelore<small>{tr("Research commons")}</small>
          </span>
        </a>
        <span className="nav-label">{tr("WORKSPACE")}</span>
        <nav className="tabs" aria-label={tr("Main navigation")}>
          {[
            ["research", tr("Explore & research")],
            ...(desktop
              ? [
                  ["publications", tr("Publication queue")],
                  ["network", tr("Network & subscriptions")],
                  ["settings", tr("Identity & agents")],
                ]
              : legacy
                ? [["migration", tr("Migrate identity")]]
                : []),
          ].map(([id, title]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setMessage("");
              }}
            >
              <Icon name={id} />
              <span>{tr(title)}</span>
              {id === "publications" && (
                <span className="nav-count">
                  {formatNumber(
                    intents.filter((i) => i.status === "pending").length,
                  )}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <Icon name="settings" />
            <div>
              <strong>{tr("Local by default")}</strong>
              <p>{tr("You decide when to share.")}</p>
            </div>
          </div>
          <div className="identity-chip">
            <span className="avatar">
              {identity.identity?.displayName?.slice(0, 1).toUpperCase() ?? "S"}
            </span>
            <div>
              <strong>
                {desktop
                  ? (identity.identity?.displayName ?? tr("Local research"))
                  : tr("Public explorer")}
              </strong>
              <small>
                {desktop
                  ? tr(identity.locked ? "Identity locked" : "Local identity")
                  : tr("Read-only explorer")}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-frame">
        <header className="app-header">
          <div className="connection-status">
            <span
              className={`status-dot ${network.connected ? "online" : ""}`}
            />
            {tr(
              desktop
                ? network.connected
                  ? "Connected"
                  : "Local research · offline"
                : "Public explorer",
            )}
          </div>
          <div className="header-tools">
            <label className="language-control">
              <Icon name="globe" />
              <span className="sr-only">{tr("Interface language")}</span>
              <select
                aria-label={tr("Interface language")}
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                {languages.map((l) => (
                  <option value={l.code} key={l.code} lang={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              aria-label={tr(theme === "dark" ? "Switch to light theme" : "Switch to dark theme")}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{tr("SELF-HOSTED TESTNET · 0.2")}</span>
              <h1>{tr(pageCopy[tab][0])}</h1>
              <p>{tr(pageCopy[tab][1])}</p>
            </div>
            {tab === "research" && desktop && (
              <button className="primary" onClick={startResearch}>
                <Icon name="plus" />
                {tr("New topic")}
              </button>
            )}
          </div>
          {(busy || message) && (
            <div
              className={`message ${failed ? "error" : ""}`}
              role="status"
              aria-live="polite"
            >
              <Icon name={failed ? "note" : "check"} />
              <div>
                {busy
                  ? tr("Working…")
                  : failed
                    ? localizeError(message, tr)
                    : tr(message)}
                {failed && (
                  <details>
                    <summary>{tr("Technical details")}</summary>
                    <pre>{message}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
          {desktop && identity.locked && (
            <section className="panel">
              <h2>
                {identity.identity ? tr("Unlock your identity") : tr("Create your identity")}
              </h2>
              <p>
                {tr(
                  "Your private key stays in the encrypted local vault. Connecting or saving never authorizes publication.",
                )}
              </p>
              <form
                onSubmit={(e) => {
                  const v = values(e);
                  void run(
                    () =>
                      call(
                        identity.identity
                          ? "identity.unlock"
                          : "identity.initialize",
                        v,
                      ),
                    "Identity unlocked",
                  );
                }}
              >
                <label>
                  {tr("Name")}
                  <input name="displayName" defaultValue="Researcher" />
                </label>
                <label>
                  {tr("Vault passphrase")}
                  <input
                    name="passphrase"
                    type="password"
                    minLength={10}
                    required
                    autoComplete="current-password"
                  />
                </label>
                <button disabled={busy}>{tr("Unlock / create")}</button>
              </form>
            </section>
          )}
          {tab === "research" && (
            <>
              <div className="research-overview">
                <div>
                  <span className="stat-icon">
                    <Icon name="research" />
                  </span>
                  <div>
                    <strong>{formatNumber(topics.length)}</strong>
                    <span>{tr("Research topics")}</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <Icon name="bookmark" />
                  </span>
                  <div>
                    <strong>{formatNumber(subscriptions.length)}</strong>
                    <span>{tr("Subscriptions")}</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon warm">
                    <Icon name="publications" />
                  </span>
                  <div>
                    <strong>
                      {formatNumber(
                        intents.filter((i) => i.status === "pending").length,
                      )}
                    </strong>
                    <span>{tr("Pending publications")}</span>
                  </div>
                </div>
              </div>
              <div className="toolbar">
                <Icon name="search" />
                <input
                  aria-label={tr("Search topics")}
                  placeholder={tr("Search a topic, question, or research direction")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button disabled={busy} onClick={() => void run(search)}>
                  {tr("Search indexes")}
                </button>
                {!desktop && (
                  <input
                    aria-label={tr("Public index URL")}
                    value={indexUrl}
                    onChange={(e) => setIndexUrl(e.target.value)}
                  />
                )}
              </div>
              {sources.map((s) => (
                <div className="source" key={s.source}>
                  <small>
                    {tr("Source: {source} · coverage limited to this index", {
                      source: s.source,
                    })}
                  </small>
                  {s.error && <Diagnostic message={s.error} tr={tr} />}
                  {s.topics?.map((t: ResearchTopic) => (
                    <button
                      className="link"
                      key={t.topicId}
                      onClick={() => {
                        setTopics((old) => [
                          ...new Map(
                            [...old, t].map((x) => [x.topicId, x]),
                          ).values(),
                        ]);
                        setTopicId(t.topicId);
                        if (!desktop)
                          setDetail({
                            topic: t,
                            subproblems: [],
                            activities: [],
                            reviews: [],
                            trails: [],
                          });
                      }}
                    >
                      {t.question}
                    </button>
                  ))}
                </div>
              ))}
              {!desktop && (
                <p className="notice">
                  {tr(
                    "Browse, search, and share approved research. Use the Sidelore local client to subscribe, research, and preview publications.",
                  )}
                </p>
              )}
              <section className="topic-workspace">
                <div className="topic-browser">
                  <h2>{tr("Open questions")}</h2>
                  <p className="topic-intro">
                    {tr("Explore in parallel. Keep the counterexamples and failures.")}
                  </p>
                  <div className="topic-list">
                    {topics
                      .filter(
                        (t) =>
                          !query ||
                          `${t.question} ${t.context}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map((t) => (
                        <button
                          className={`topic-card ${topicId === t.topicId ? "active" : ""}`}
                          key={t.topicId}
                          onClick={() => {
                            setTopicId(t.topicId);
                            if (!desktop)
                              void run(async () => {
                                const r = await fetch(
                                  new URL(
                                    `/v1/topics/${encodeURIComponent(t.topicId)}`,
                                    indexUrl,
                                  ),
                                );
                                if (!r.ok) throw new Error("Unable to load this topic.");
                                setDetail(await r.json());
                              });
                          }}
                        >
                          <small>
                            {tr(t.status)} ·{" "}
                            {t.domains.join(" / ") || tr("Interdisciplinary")}
                          </small>
                          <strong>{t.question}</strong>
                          <span>{t.context.slice(0, 100)}</span>
                        </button>
                      ))}
                    {!topics.length && (
                      <EmptyState
                        title={tr("Start with a good question")}
                        description={tr(
                          "Create your first topic or import a shared topic link.",
                        )}
                      />
                    )}
                  </div>
                </div>
                <article className="topic-detail">
                  {detail ? (
                    <>
                      <span className="eyebrow">{tr("Research topics")}</span>
                      <h3>{detail.topic.question}</h3>
                      <p>{detail.topic.context}</p>
                      <div className="actions">
                        {desktop && (
                          <button
                            disabled={!networkId || busy}
                            onClick={() =>
                              void run(
                                () =>
                                  call(
                                    selectedSubscription
                                      ? "subscription.remove"
                                      : "subscription.add",
                                    {
                                      networkId,
                                      topicId,
                                      rootCid: detail.topic.contentCid,
                                    },
                                  ),
                                selectedSubscription
                                  ? "Unsubscribed"
                                  : "Subscribed. This does not start research or announce participation.",
                              )
                            }
                          >
                            {selectedSubscription
                              ? tr("Unsubscribe")
                              : tr("Subscribe to topic")}
                          </button>
                        )}
                        <button
                          onClick={() =>
                            void run(async () => {
                              const link = topicShareLink(
                                networkId || "public",
                                topicId,
                                detail.topic.contentCid,
                              );
                              await navigator.clipboard.writeText(link);
                            }, "Share link copied")
                          }
                        >
                          {tr("Copy share link")}
                        </button>
                      </div>
                      <h4>{tr("Subproblems · parallel attempts welcome")}</h4>
                      {!detail.subproblems.length && (
                        <p className="section-empty">
                          {tr("No records yet. Leave the first step of an exploration.")}
                        </p>
                      )}
                      {detail.subproblems.map((s: any) => (
                        <div className="entry" key={s.subproblemId}>
                          <strong>{s.title}</strong>
                          <p>{s.statement}</p>
                          <small className="badge">{tr(s.status)}</small>
                        </div>
                      ))}
                      <h4>{tr("Research attempts")}</h4>
                      {!detail.trails.length && (
                        <p className="section-empty">
                          {tr("No records yet. Leave the first step of an exploration.")}
                        </p>
                      )}
                      {detail.trails.map((t: any) => (
                        <div className="entry" key={t.trailId}>
                          <strong>{t.title}</strong>
                          <p>{t.abstract}</p>
                          <small>
                            {tr(t.status)} ·{" "}
                            {tr(
                              t.derivedVerificationState ?? t.verificationState,
                            )}
                          </small>
                        </div>
                      ))}
                      <h4>{tr("Handoffs & progress")}</h4>
                      {!detail.activities.length && (
                        <p className="section-empty">
                          {tr("No records yet. Leave the first step of an exploration.")}
                        </p>
                      )}
                      {detail.activities.map((a: any) => (
                        <div className="entry" key={a.activityId}>
                          <small className="badge">{tr(a.activityType)}</small>
                          <p>{a.payload.note ?? JSON.stringify(a.payload)}</p>
                        </div>
                      ))}
                      <h4>{tr("Replication, counterexamples & reviews")}</h4>
                      {!detail.reviews.length && (
                        <p className="section-empty">
                          {tr("No records yet. Leave the first step of an exploration.")}
                        </p>
                      )}
                      {detail.reviews.map((r: any) => (
                        <div className="entry" key={r.reviewId}>
                          <strong>{tr(r.status)}</strong>
                          <p>{r.method}</p>
                          <p>{r.result}</p>
                        </div>
                      ))}
                    </>
                  ) : (
                    <EmptyState
                      title={tr("Room for the next discovery")}
                      description={tr(
                        "Select a topic to explore its subproblems, attempts, and reviews.",
                      )}
                    />
                  )}
                </article>
              </section>
              {desktop && (
                <section className="panel composer-panel" id="composer">
                  <div className="section-heading">
                    <span className="step-number">01</span>
                    <div>
                      <span className="eyebrow">{tr("RECORD & REFLECT")}</span>
                      <h2>{tr("Local research workspace")}</h2>
                    </div>
                  </div>
                  <p>
                    {tr(
                      "New work stays on this device. For failures, explain why the hypothesis or method failed; logs can support the evidence.",
                    )}
                  </p>
                  <label>
                    {tr("Workspace")}
                    <select
                      value={workspaceId}
                      onChange={(e) => {
                        setWorkspaceId(e.target.value);
                        setSelection([]);
                      }}
                    >
                      {workspaces.map((w) => (
                        <option key={w.workspaceId} value={w.workspaceId}>
                          {w.workspaceId === "local" ? tr("Local research") : w.name}{" "}
                          ·{" "}
                          {w.classification === "private"
                            ? tr("Approval each time")
                            : tr("Public research task")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <form
                    className="research-form"
                    onSubmit={(e) => {
                      const v = values(e);
                      void run(async () => {
                        const result = await call("research.save", {
                          ...v,
                          workspaceId,
                          kind,
                          attachments: kind === "trail" ? attachments : [],
                          topicId: kind === "topic" ? undefined : topicId,
                        });
                        setSelection(
                          result.records.map((r: any) => `${r.kind}:${r.id}`),
                        );
                        if (kind === "topic") setTopicId(result.result.topicId);
                      }, "Saved locally. Select records below to preview a publication.");
                    }}
                  >
                    <label>
                      {tr("Record type")}
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                      >
                        <option value="topic">{tr("New topic")}</option>
                        <option value="subproblem">{tr("Subproblem")}</option>
                        <option value="trail">
                          {tr("Attempt / failure evidence")}
                        </option>
                        <option value="event">{tr("Add a research record")}</option>
                        <option value="activity">{tr("Progress / handoff")}</option>
                        <option value="topicReview">{tr("Replication / review")}</option>
                      </select>
                    </label>
                    {kind !== "topic" && (
                      <p>
                        {tr("Topic:")}
                        {detail?.topic.question ?? tr("Select a topic first")}
                      </p>
                    )}
                    {kind === "topic" ? (
                      <>
                        <label>
                          {tr("Research question")}
                          <input name="question" required />
                        </label>
                        <label>
                          {tr("Context")}
                          <textarea name="context" />
                        </label>
                      </>
                    ) : (
                      <>
                        {["trail", "subproblem"].includes(kind) && (
                          <label>
                            {tr("Title")}
                            <input name="title" required />
                          </label>
                        )}
                        {kind === "subproblem" ? (
                          <label>
                            {tr("Problem statement")}
                            <textarea name="statement" required />
                          </label>
                        ) : (
                          <>
                            {kind !== "topicReview" && (
                              <label>
                                {tr("Research notes")}
                                <textarea name="note" required />
                              </label>
                            )}
                            {kind === "trail" && (
                              <label>
                                {tr("Attachments (optional, up to 7 MiB total)")}
                                <input
                                  type="file"
                                  multiple
                                  onChange={(e) => {
                                    const files = Array.from(
                                      e.target.files ?? [],
                                    );
                                    void run(async () => {
                                      if (
                                        files.reduce((n, f) => n + f.size, 0) >
                                        7 * 1024 ** 2
                                      )
                                        throw new Error("Attachments exceed 7 MiB.");
                                      setAttachments(
                                        await Promise.all(
                                          files.map(async (f) => {
                                            const bytes = new Uint8Array(
                                              await f.arrayBuffer(),
                                            );
                                            let binary = "";
                                            for (const b of bytes)
                                              binary += String.fromCharCode(b);
                                            return {
                                              filename: f.name,
                                              mediaType: f.type,
                                              data: btoa(binary)
                                                .replaceAll("+", "-")
                                                .replaceAll("/", "_")
                                                .replace(/=+$/, ""),
                                            };
                                          }),
                                        ),
                                      );
                                    });
                                  }}
                                />
                              </label>
                            )}
                            {kind === "event" && (
                              <label>
                                {tr("Research attempts")}
                                <select name="trailId" required>
                                  {detail?.trails.map((t: any) => (
                                    <option key={t.trailId} value={t.trailId}>
                                      {t.title}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {["trail", "event"].includes(kind) && (
                              <label>
                                {tr("Evidence type")}
                                <select name="eventType">
                                  <option value="hypothesis">
                                    {tr("Hypothesis")}
                                  </option>
                                  <option value="experiment">
                                    {tr("Experiment")}
                                  </option>
                                  <option value="failure">
                                    {tr("Failure evidence")}
                                  </option>
                                  <option value="counterexample">
                                    {tr("Counterexample")}
                                  </option>
                                  <option value="result">
                                    {tr("Result")}
                                  </option>
                                  <option value="open_question">
                                    {tr("Open question")}
                                  </option>
                                </select>
                              </label>
                            )}
                            {kind === "activity" && (
                              <label>
                                {tr("Activity")}
                                <select name="activityType">
                                  <option value="attempt_started">
                                    {tr("Start an independent attempt")}
                                  </option>
                                  <option value="handoff_requested">
                                    {tr("Request a handoff")}
                                  </option>
                                  <option value="summary">
                                    {tr("Progress summary")}
                                  </option>
                                  <option value="challenge">
                                    {tr("Challenge a claim")}
                                  </option>
                                  <option value="evidence_link">
                                    {tr("Evidence note")}
                                  </option>
                                </select>
                              </label>
                            )}
                            {kind === "topicReview" && (
                              <>
                                <label>
                                  {tr("Review conclusion")}
                                  <select name="status">
                                    <option value="replicated">
                                      {tr("Replicated")}
                                    </option>
                                    <option value="partially_replicated">
                                      {tr("Partially replicated")}
                                    </option>
                                    <option value="challenged">
                                      {tr("Challenged")}
                                    </option>
                                    <option value="not_reproducible">
                                      {tr("Not reproducible")}
                                    </option>
                                    <option value="corrected">
                                      {tr("Corrected")}
                                    </option>
                                  </select>
                                </label>
                                <label>
                                  {tr("Replication method")}
                                  <textarea name="method" required />
                                </label>
                                <label>
                                  {tr("Results & evidence")}
                                  <textarea name="result" required />
                                </label>
                              </>
                            )}
                            <label>
                              {tr("Subproblem (optional)")}
                              <select name="subproblemId">
                                <option value="">{tr("Entire topic")}</option>
                                {detail?.subproblems.map((s: any) => (
                                  <option
                                    key={s.subproblemId}
                                    value={s.subproblemId}
                                  >
                                    {s.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                      </>
                    )}
                    <button
                      disabled={
                        busy ||
                        identity.locked ||
                        (kind !== "topic" && !topicId)
                      }
                    >
                      {tr("Save locally")}
                    </button>
                  </form>
                  <div className="selection-heading">
                    <span className="step-number">02</span>
                    <div>
                      <h3>{tr("Choose records to share")}</h3>
                      <p>{tr("Only selected records enter the preview. Saving does not publish.")}</p>
                    </div>
                    <span className="badge">
                      {tr("Selected: {count}", {
                        count: formatNumber(selection.length),
                      })}
                    </span>
                  </div>
                  {!catalog.length && (
                    <p className="empty">
                      {tr("After saving your research, choose what to share here.")}
                    </p>
                  )}
                  <div className="record-selection">
                    {catalog.map((row) => {
                      const id = `${row.ref.kind}:${row.ref.id}`;
                      return (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={selection.includes(id)}
                            onChange={(e) =>
                              setSelection((old) =>
                                e.target.checked
                                  ? [...old, id]
                                  : old.filter((v) => v !== id),
                              )
                            }
                          />
                          <span>
                            <small>{tr(labels[row.ref.kind])}</small>{" "}
                            {String(row.title).slice(0, 180)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="actions">
                    <label>
                      {tr("Destination network")}
                      <select
                        value={networkId}
                        onChange={(e) => setNetworkId(e.target.value)}
                      >
                        <option value="">{tr("Select a network")}</option>
                        {profiles
                          .filter((p) => p.kind !== "local")
                          .map((p) => (
                            <option key={p.networkId} value={p.networkId}>
                              {p.name} · {tr(p.kind)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={!selection.length || !networkId || busy}
                      onClick={() =>
                        void run(async () => {
                          const i = await call("publication.prepare", {
                            workspaceId,
                            networkId,
                            topicId: topicId || "unscoped",
                            records: catalog
                              .filter((r) =>
                                selection.includes(`${r.ref.kind}:${r.ref.id}`),
                              )
                              .map((r) => r.ref),
                          });
                          setPreview(i);
                          setConfirmed(false);
                          setTab("publications");
                        })
                      }
                    >
                      {tr("Freeze & preview")}
                    </button>
                    <button
                      disabled={!selection.length || !networkId || busy}
                      onClick={() =>
                        void run(async () => {
                          const i = await call("bridge.prepare", {
                            workspaceId,
                            networkId,
                            topicId: topicId || "unscoped",
                            records: catalog
                              .filter((r) =>
                                selection.includes(`${r.ref.kind}:${r.ref.id}`),
                              )
                              .map((r) => r.ref),
                          });
                          setPreview(i);
                          setConfirmed(false);
                          setTab("publications");
                        })
                      }
                    >
                      {tr("Preview Bridge snapshot")}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          {tab === "publications" && (
            <section className="panel">
              <h2>{tr("Publish with permission")}</h2>
              <p>
                {tr(
                  "Approval applies to the complete snapshot. Any edit needs a new preview. Once transmitted, withdrawal cannot guarantee deletion of other nodes’ copies.",
                )}
              </p>
              {preview && (
                <article className="preview">
                  <h3>{tr("Publication preview")}</h3>
                  <dl className="preview-meta">
                    <div>
                      <dt>{tr("Destination network")}</dt>
                      <dd>
                        {profiles.find(
                          (p) => p.networkId === preview.snapshot.networkId,
                        )?.name ?? preview.snapshot.networkId}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("Size")}</dt>
                      <dd>
                        {tr("{count} bytes", {
                          count: formatNumber(preview.preview.totalBytes),
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>{tr("Attachments")}</dt>
                      <dd>
                        {formatNumber(preview.preview.attachments.length)}
                      </dd>
                    </div>
                  </dl>
                  <p className="dependency-note">
                    {tr("Includes {count} already-approved dependencies", {
                      count: formatNumber(preview.preview.dependencies.length),
                    })}
                  </p>
                  <SnapshotContent intent={preview} tr={tr} />
                  <details className="technical-details">
                    <summary>{tr("Content CID & destination network ID")}</summary>
                    <p className="mono">{preview.contentCid}</p>
                    <p className="mono">{preview.snapshot.networkId}</p>
                  </details>
                  {preview.preview.warnings.map((w) => (
                    <p className="notice" key={w}>
                      {tr(w)}
                    </p>
                  ))}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    {tr(
                      "I have checked the content, attachments, filenames, references, and destination network. I approve this immutable snapshot.",
                    )}
                  </label>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={!confirmed || busy}
                      onClick={() =>
                        void run(async () => {
                          await call("publication.approve", {
                            intentId: preview.intentId,
                            contentCid: preview.contentCid,
                          });
                          setPreview(undefined);
                        }, "Approved. Waiting for transmission and confirmation from other nodes.")
                      }
                    >
                      {tr("Approve this snapshot")}
                    </button>
                    <button onClick={() => setPreview(undefined)}>
                      {tr("Review later")}
                    </button>
                  </div>
                </article>
              )}
              {!intents.length && (
                <EmptyState
                  icon="publications"
                  title={tr("Your research. Your moment to share.")}
                  description={tr("Select records in your workspace, preview them, then approve publication.")}
                />
              )}
              {intents.map((i) => (
                <article className="entry publication-card" key={i.intentId}>
                  <div className="publication-heading">
                    <div>
                      <small className="eyebrow">
                        {tr("{count} records", {
                          count: formatNumber(i.preview.records.length),
                        })}{" "}
                        ·{" "}
                        {profiles.find(
                          (p) => p.networkId === i.snapshot.networkId,
                        )?.name ?? i.snapshot.networkId}
                      </small>
                      <h3>
                        {i.snapshot.bundle.topics?.find(
                          (t) => t.topicId === i.snapshot.topicId,
                        )?.question ??
                          i.snapshot.bundle.trails[0]?.title ??
                          tr("Research contribution")}
                      </h3>
                    </div>
                    <span
                      className={`badge ${i.status === "pending" ? "warm" : ""}`}
                    >
                      {tr(i.status)}
                    </span>
                  </div>
                  <ol className="publication-progress">
                    <li className={i.status === "approved" ? "complete" : ""}>
                      <span className="progress-icon">
                        {i.status === "approved" ? <Icon name="check" /> : "1"}
                      </span>
                      <div>
                        <strong>{tr("Approved for publication")}</strong>
                        <small>{tr(i.status)}</small>
                      </div>
                    </li>
                    <li className={i.propagatedAt ? "complete" : ""}>
                      <span className="progress-icon">
                        {i.propagatedAt ? <Icon name="check" /> : "2"}
                      </span>
                      <div>
                        <strong>{tr("Transmitted")}</strong>
                        <small>
                          {tr(i.propagatedAt ? "Sent" : "Waiting to send")}
                        </small>
                      </div>
                    </li>
                    <li className={i.receivedBy.length ? "complete" : ""}>
                      <span className="progress-icon">
                        {i.receivedBy.length ? <Icon name="check" /> : "3"}
                      </span>
                      <div>
                        <strong>{tr("Received by peers")}</strong>
                        <small>
                          {tr("{count} peers", {
                            count: formatNumber(i.receivedBy.length),
                          })}
                        </small>
                      </div>
                    </li>
                  </ol>
                  <details className="technical-details">
                    <summary>{tr("Signature & transmission details")}</summary>
                    <p className="mono">{i.contentCid}</p>
                    <p className="mono">{i.snapshot.topicId}</p>
                    <p>
                      {i.propagatedAt
                        ? formatDate(i.propagatedAt)
                        : tr("Not transmitted yet")}
                    </p>
                  </details>
                  {!i.receivedBy.length && (
                    <p className="notice">
                      {tr("No other node has confirmed receipt. This content may still exist only on your device.")}
                    </p>
                  )}
                  {i.lastError && <Diagnostic message={i.lastError} tr={tr} />}
                  <div className="actions">
                    {i.bridge && i.status === "approved" && (
                      <button
                        onClick={() =>
                          void run(async () =>
                            download(
                              "sidelore-bridge.json",
                              await call("bridge.export", {
                                intentId: i.intentId,
                                contentCid: i.contentCid,
                              }),
                            ),
                          )
                        }
                      >
                        {tr("Export approved Bridge")}
                      </button>
                    )}
                    {i.status === "pending" && (
                      <button
                        onClick={() => {
                          setPreview(i);
                          setConfirmed(false);
                        }}
                      >
                        {tr("Preview & approve")}
                      </button>
                    )}
                    {["pending", "approved"].includes(i.status) && (
                      <button
                        onClick={() =>
                          void run(
                            () =>
                              call("publication.cancel", {
                                intentId: i.intentId,
                              }),
                            i.propagatedAt
                              ? "Forwarding stopped on this node and a withdrawal request was recorded. Other copies may remain."
                              : "Unsent publication cancelled",
                          )
                        }
                      >
                        {i.propagatedAt ? tr("Request withdrawal") : tr("Cancel publication")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
          {tab === "network" && (
            <section className="panel">
              <h2>{tr("Connect to your research network")}</h2>
              <p>
                {tr(
                  "Clients need no domain or public endpoint. This release uses a self-hosted testnet; add bootstrap nodes supplied by an operator.",
                )}
              </p>
              <div className="actions">
                <select
                  aria-label={tr("Network profile")}
                  value={networkId}
                  onChange={(e) => setNetworkId(e.target.value)}
                >
                  <option value="">{tr("Local research")}</option>
                  {profiles
                    .filter((p) => p.kind !== "local")
                    .map((p) => (
                      <option key={p.networkId} value={p.networkId}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!networkId || busy || identity.locked}
                  onClick={() =>
                    void run(
                      () => call("network.connect", { networkId }),
                      "Network started. Offline work remains on your device.",
                    )
                  }
                >
                  {tr("Connect")}
                </button>
                <button
                  disabled={!network.connected || busy}
                  onClick={() =>
                    void run(() => call("network.disconnect"), "Disconnected")
                  }
                >
                  {tr("Disconnect")}
                </button>
                <button
                  disabled={!network.connected || busy}
                  onClick={() =>
                    void run(() => call("network.sync"), "Sync complete")
                  }
                >
                  {tr("Sync now")}
                </button>
              </div>
              <div className="network-overview">
                <div>
                  <Icon name="network" />
                  <strong>{tr(network.connected ? "Connected" : "Offline")}</strong>
                  <span>{tr("Connection")}</span>
                </div>
                <div>
                  <strong>{formatNumber(network.peers?.length ?? 0)}</strong>
                  <span>{tr("Connected peers")}</span>
                </div>
                <div>
                  <strong>
                    {formatNumber(currentProfile?.bootstrap.length ?? 0)}
                  </strong>
                  <span>{tr("Bootstrap nodes")}</span>
                </div>
                <div>
                  <strong>
                    {currentProfile
                      ? `${formatNumber(Math.round(currentProfile.cacheBytes / 1024 ** 2))} MiB`
                      : "—"}
                  </strong>
                  <span>{tr("Cache limit")}</span>
                </div>
              </div>
              <details className="technical-details">
                <summary>{tr("Connection diagnostics")}</summary>
                <pre>{JSON.stringify(network, null, 2)}</pre>
              </details>
              <details>
                <summary>{tr("Add bootstrap nodes / organization network")}</summary>
                <form
                  onSubmit={(e) => {
                    const v = values(e);
                    const profile = {
                      networkId: v.id,
                      name: v.name,
                      kind: v.kind,
                      bootstrap: String(v.bootstrap)
                        .split(/\s+/)
                        .filter(Boolean),
                      indexes: String(v.indexes).split(/\s+/).filter(Boolean),
                      listen: ["/ip4/0.0.0.0/tcp/0"],
                      autoConnect: false,
                      relayServer: false,
                      cacheBytes: Number(v.cacheMiB) * 1024 * 1024,
                      memberPeerIds: String(v.members)
                        .split(/\s+/)
                        .filter(Boolean),
                    };
                    void run(async () => {
                      await call("network.save", { profile });
                      setNetworkId(String(v.id));
                    }, "Network profile saved; not connected yet.");
                  }}
                >
                  <label>
                    {tr("Network ID")}
                    <input name="id" required pattern="[a-zA-Z0-9._-]+" />
                  </label>
                  <label>
                    {tr("Name")}
                    <input name="name" required />
                  </label>
                  <label>
                    {tr("Type")}
                    <select name="kind">
                      <option value="public">{tr("Public network")}</option>
                      <option value="organization">
                        {tr("Organization network (separate storage)")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {tr("Bootstrap / relay multiaddresses")}
                    <textarea
                      name="bootstrap"
                      placeholder={tr("One multiaddress per line")}
                    />
                  </label>
                  <label>
                    {tr("Public index URLs (leave empty for organizations)")}
                    <textarea name="indexes" />
                  </label>
                  <label>
                    {tr("Organization member peer IDs")}
                    <textarea name="members" />
                  </label>
                  <label>
                    {tr("Automatic cache limit (MiB)")}
                    <input
                      name="cacheMiB"
                      type="number"
                      min="1"
                      defaultValue="1024"
                    />
                  </label>
                  <button disabled={busy}>{tr("Save profile")}</button>
                </form>
              </details>
              <h3>{tr("Import a shared topic")}</h3>
              <form
                onSubmit={(e) => {
                  const v = values(e);
                  void run(async () => {
                    const link = parseTopicShareLink(String(v.link));
                    await call("subscription.add", link);
                    setTopicId(link.topicId);
                  }, "Subscribed to the shared topic");
                }}
              >
                <input
                  name="link"
                  aria-label={tr("Topic share link")}
                  placeholder="sidelore://topic/…"
                  required
                />
                <button disabled={busy}>{tr("Subscribe")}</button>
              </form>
              <h3>{tr("Subscriptions & sync progress")}</h3>
              {!subscriptions.length && (
                <EmptyState
                  icon="bookmark"
                  title={tr("Follow a question worth pursuing")}
                  description={tr(
                    "Subscriptions sync updates. They do not start research or announce your participation.",
                  )}
                />
              )}
              {subscriptions.map((s) => (
                <div className="entry" key={`${s.networkId}:${s.topicId}`}>
                  <strong>
                    {topics.find((t) => t.topicId === s.topicId)?.question ??
                      s.topicId}
                  </strong>
                  <p>
                    {tr("{network} · Last synced: {date}", {
                      network: s.networkId,
                      date: s.lastSyncAt
                        ? formatDate(s.lastSyncAt)
                        : tr("Not synced yet"),
                    })}
                  </p>
                  {s.lastError && <Diagnostic message={s.lastError} tr={tr} />}
                </div>
              ))}
              {currentProfile && (
                <p>
                  {tr("Cache limit: {count} MiB · attachments download on demand", {
                    count: formatNumber(
                      Math.round(currentProfile.cacheBytes / 1024 ** 2),
                    ),
                  })}
                </p>
              )}
            </section>
          )}
          {tab === "settings" && (
            <section className="panel">
              <h2>{tr("Identity, recovery & task permissions")}</h2>
              <p>{tr("Language and appearance stay on this device. Research content is never translated or changed.")}</p>
              <details className="settings-group" open>
                <summary>{tr("Identity & backups")}</summary>
                <div className="actions">
                  <button
                    onClick={() =>
                      void run(async () =>
                        download(
                          "sidelore-research-backup.json",
                          await call("backup.export"),
                        ),
                      )
                    }
                  >
                    {tr("Export local research backup")}
                  </button>
                  <button
                    onClick={() =>
                      void run(() => call("identity.lock"), "Identity locked")
                    }
                  >
                    {tr("Lock identity")}
                  </button>
                </div>
                <p>
                  {tr(
                    "Research backups may contain private material. Restoring does not re-enable networking or automatic publication grants.",
                  )}
                </p>
                <form
                  onSubmit={(e) => {
                    const v = values(e);
                    void run(async () =>
                      download(
                        "sidelore-identity.encrypted.json",
                        await call("identity.backup", v),
                      ),
                    );
                  }}
                >
                  <label>
                    {tr("New identity-backup passphrase (store separately)")}
                    <input
                      name="passphrase"
                      type="password"
                      minLength={10}
                      required
                    />
                  </label>
                  <button>{tr("Export encrypted identity backup")}</button>
                </form>
                <label>
                  {tr("Restore research backup")}
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run(
                          async () =>
                            call("backup.restore", {
                              bundle: JSON.parse(await file.text()),
                            }),
                          "Restored locally. Automatic connections and grants were disabled.",
                        );
                    }}
                  />
                </label>
                <details>
                  <summary>{tr("Restore encrypted identity")}</summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      void run(async () => {
                        const backup = JSON.parse(
                          await (fd.get("backup") as File).text(),
                        );
                        const result = await call("identity.restore", {
                          backup,
                          identityId:
                            String(fd.get("identityId")) ||
                            Object.keys(backup)[0],
                          passphrase: String(fd.get("passphrase")),
                        });
                        if (result.verified)
                          download(
                            "sidelore-migration-receipt.json",
                            result.receipt,
                          );
                        return result;
                      }, "Identity restored. The network remains disconnected.");
                    }}
                  >
                    <label>
                      {tr("Encrypted backup")}
                      <input name="backup" type="file" required />
                    </label>
                    <label>
                      {tr("Identity ID (optional for a single identity)")}
                      <input name="identityId" />
                    </label>
                    <label>
                      {tr("Original passphrase")}
                      <input name="passphrase" type="password" required />
                    </label>
                    <button>{tr("Verify & restore")}</button>
                  </form>
                </details>
                {legacy && (
                  <div className="notice">
                    <p>
                      {tr(
                        "A legacy browser identity was found. Old storage is cleared only after local vault verification succeeds.",
                      )}
                    </p>
                    {desktop ? (
                      <form
                        onSubmit={(e) => {
                          const v = values(e);
                          void run(async () => {
                            const keyPair = await loadBrowserIdentity();
                            const r = await call("identity.migrate", {
                              keyPair,
                              passphrase: v.passphrase,
                            });
                            if (r.verified) {
                              await clearMigratedBrowserIdentity();
                              setLegacy(false);
                            }
                          }, "Legacy identity moved to the encrypted vault");
                        }}
                      >
                        <input
                          name="passphrase"
                          type="password"
                          minLength={10}
                          aria-label={tr("Migration passphrase")}
                          required
                        />
                        <button>{tr("Verify & migrate")}</button>
                      </form>
                    ) : (
                      <button
                        onClick={() =>
                          void run(async () =>
                            download(
                              "sidelore-legacy-identity.local.json",
                              await loadBrowserIdentity(),
                            ),
                          )
                        }
                      >
                        {tr("Export for local migration")}
                      </button>
                    )}
                  </div>
                )}
              </details>
              <details className="settings-group">
                <summary>{tr("Organization Bridge")}</summary>
                <p>
                  {tr(
                    "Enabling only allows snapshot preparation. Every transfer between networks needs its own preview and approval.",
                  )}
                </p>
                <button
                  onClick={() =>
                    void run(
                      () => call("bridge.enable"),
                      "Bridge enabled; no content has been approved for transfer.",
                    )
                  }
                >
                  {tr("Enable Bridge")}
                </button>
                <label>
                  {tr("Import an approved Bridge snapshot")}
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run(
                          async () =>
                            call(
                              "bridge.import",
                              JSON.parse(await file.text()),
                            ),
                          "Destination-network snapshot verified and imported",
                        );
                    }}
                  />
                </label>
              </details>
              <details className="settings-group">
                <summary>{tr("Workspaces")}</summary>
                <h3>{tr("New workspace")}</h3>
                <form
                  onSubmit={(e) => {
                    const v = values(e);
                    void run(
                      () => call("workspace.create", v),
                      "Workspace created. Its classification cannot be changed.",
                    );
                  }}
                >
                  <label>
                    {tr("Name")}
                    <input name="name" required />
                  </label>
                  <label>
                    {tr("Research material scope")}
                    <select name="classification">
                      <option value="private">
                        {tr("May access private material: human approval every time")}
                      </option>
                      <option value="public-research">
                        {tr("Explicitly designated public research task")}
                      </option>
                    </select>
                  </label>
                  <button>{tr("Create workspace")}</button>
                </form>
              </details>
              <details className="settings-group">
                <summary>{tr("Agent access & permissions")}</summary>
                <h3>{tr("Agent access")}</h3>
                <form
                  onSubmit={(e) => {
                    const v = values(e);
                    void run(async () =>
                      setAgentCredential(await call("agent.create", v)),
                    );
                  }}
                >
                  <label>
                    {tr("Agent ID")}
                    <input name="agentId" required />
                  </label>
                  <label>
                    {tr("Allowed workspace")}
                    <select name="workspaceId">
                      {workspaces.map((w) => (
                        <option key={w.workspaceId} value={w.workspaceId}>
                          {w.workspaceId === "local" ? tr("Local research") : w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button>{tr("Create scoped credential")}</button>
                </form>
                {agentCredential && (
                  <div className="notice">
                    <p>
                      {tr(
                        "This credential is shown locally only. Agents cannot give human approval or manage grants.",
                      )}
                    </p>
                    <pre>{JSON.stringify(agentCredential, null, 2)}</pre>
                    <button onClick={() => setAgentCredential(undefined)}>
                      {tr("Hide credential")}
                    </button>
                  </div>
                )}
                <h3>{tr("Allow automatic publication for a scoped task")}</h3>
                <form
                  onSubmit={(e) => {
                    const v = values(e);
                    void run(
                      () =>
                        call("grant.create", {
                          agentId: v.agentId,
                          workspaceId: v.workspaceId,
                          topicId: v.topicId,
                          networkId: v.networkId,
                          expiresAt: new Date(
                            String(v.expiresAt),
                          ).toISOString(),
                          maxCount: Number(v.maxCount),
                          maxBytes: Number(v.maxKiB) * 1024,
                          contentTypes: [String(v.contentType)],
                          allowAttachments: false,
                        }),
                      "Task grant created; attachments are excluded by default.",
                    );
                  }}
                >
                  <label>
                    {tr("Agent ID")}
                    <input name="agentId" required />
                  </label>
                  <label>
                    {tr("Public research workspace")}
                    <select name="workspaceId" required>
                      {workspaces
                        .filter((w) => w.classification === "public-research")
                        .map((w) => (
                          <option key={w.workspaceId} value={w.workspaceId}>
                            {w.workspaceId === "local"
                              ? tr("Local research")
                              : w.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {tr("Topic")}
                    <select name="topicId" required>
                      {topics.map((t) => (
                        <option key={t.topicId} value={t.topicId}>
                          {t.question}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("Target network")}
                    <select name="networkId" required>
                      {profiles
                        .filter((p) => p.kind === "public")
                        .map((p) => (
                          <option key={p.networkId} value={p.networkId}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {tr("Allowed content type")}
                    <select name="contentType">
                      <option value="topicActivities">
                        {tr("Research progress / handoff")}
                      </option>
                      <option value="topicReviews">{tr("Replication & review")}</option>
                      <option value="events">{tr("Research records")}</option>
                    </select>
                  </label>
                  <label>
                    {tr("Expires at")}
                    <input type="datetime-local" name="expiresAt" required />
                  </label>
                  <label>
                    {tr("Publication limit")}
                    <input
                      type="number"
                      name="maxCount"
                      min="1"
                      defaultValue="10"
                    />
                  </label>
                  <label>
                    {tr("Total size limit (KiB)")}
                    <input
                      type="number"
                      name="maxKiB"
                      min="1"
                      defaultValue="1024"
                    />
                  </label>
                  <button disabled={busy}>{tr("Grant task permission")}</button>
                </form>
                {grants.map((g) => (
                  <article className="entry" key={g.grantId}>
                    <strong>
                      {g.agentId} · {g.topicId}
                    </strong>
                    <p>
                      {tr("Used {used}/{max} · expires {date}", {
                        used: formatNumber(g.usedCount),
                        max: formatNumber(g.maxCount),
                        date: formatDate(g.expiresAt),
                      })}{" "}
                      · {g.revokedAt ? tr("Revoked") : tr("Scope checked on use")}
                    </p>
                    <p className="mono">{g.grantId}</p>
                    <button
                      disabled={!!g.revokedAt}
                      onClick={() =>
                        void run(
                          () => call("grant.revoke", { grantId: g.grantId }),
                          "Grant revoked",
                        )
                      }
                    >
                      {tr("Revoke")}
                    </button>
                  </article>
                ))}
              </details>
            </section>
          )}
          {tab === "migration" && !desktop && (
            <section className="panel">
              <h2>{tr("Move your legacy identity to the local vault")}</h2>
              <p>
                {tr(
                  "Export an encrypted migration file, verify and restore it under Identity & agents in the desktop client, then import the receipt. The old browser identity is removed only after the receipt is verified.",
                )}
              </p>
              <form
                onSubmit={(e) => {
                  const v = values(e);
                  void run(async () => {
                    const saved = await loadBrowserIdentity();
                    if (!saved) throw new Error("No legacy identity found.");
                    const core = await import(
                      "../../../packages/core/src/index.js"
                    );
                    const identity = saved.identity as any;
                    const backup = {
                      [identity.identityId]: {
                        identity,
                        vault: core.lockSecret(
                          saved.privateKey,
                          String(v.passphrase),
                        ),
                      },
                    };
                    localStorage.setItem(
                      "sidelore-migration-cid",
                      core.cidFromValue(backup),
                    );
                    download("sidelore-identity.encrypted.json", backup);
                  });
                }}
              >
                <label>
                  {tr("Migration file passphrase")}
                  <input
                    name="passphrase"
                    type="password"
                    minLength={10}
                    required
                  />
                </label>
                <button>{tr("Export encrypted migration file")}</button>
              </form>
              <label>
                {tr("Import desktop verification receipt")}
                <input
                  type="file"
                  accept="application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void run(async () => {
                        const receipt = JSON.parse(await file.text());
                        const saved = await loadBrowserIdentity();
                        const core = await import(
                          "../../../packages/core/src/index.js"
                        );
                        const { signature, ...body } = receipt;
                        const identity = saved?.identity as any;
                        if (
                          !identity ||
                          body.identityId !== identity.identityId ||
                          body.backupCid !==
                            localStorage.getItem("sidelore-migration-cid") ||
                          !core.verifyBytes(
                            core.canonicalBytes(body),
                            signature,
                            identity.primaryPublicKey,
                          )
                        )
                          throw new Error("Receipt verification failed; the old identity was kept.");
                        await clearMigratedBrowserIdentity();
                        localStorage.removeItem("sidelore-migration-cid");
                        setLegacy(false);
                        setTab("research");
                      }, "Local migration verified; the old browser identity was removed.");
                  }}
                />
              </label>
            </section>
          )}
          <footer>
            <span>{tr("Local research. Shared evidence.")}</span>
            <span>{tr("Publication requires explicit permission")}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
