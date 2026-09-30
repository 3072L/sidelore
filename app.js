const statusLabels = {
  negative: "Negative",
  unresolved: "Unresolved",
  partial: "Partial",
  reframed: "Reframed"
};

const state = {
  records: [],
  selectedId: null,
  query: "",
  domain: "all",
  status: "all",
  sort: "recent"
};

const elements = {
  search: document.querySelector("#searchInput"),
  domain: document.querySelector("#domainFilter"),
  status: document.querySelector("#statusFilter"),
  sort: document.querySelector("#sortSelect"),
  clear: document.querySelector("#clearFilters"),
  list: document.querySelector("#recordList"),
  meta: document.querySelector("#resultsMeta"),
  detail: document.querySelector("#detailPanel"),
  statTrails: document.querySelector("#statTrails"),
  statDomains: document.querySelector("#statDomains"),
  statBranches: document.querySelector("#statBranches"),
  statContributors: document.querySelector("#statContributors"),
  openComposer: document.querySelector("#openComposer"),
  closeComposer: document.querySelector("#closeComposer"),
  composerPanel: document.querySelector("#composerPanel"),
  composerForm: document.querySelector("#composerForm"),
  composerStatus: document.querySelector("#composerStatus"),
  exportDrafts: document.querySelector("#exportDrafts"),
  importDrafts: document.querySelector("#importDrafts")
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[character]));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function statusLabel(value) {
  return statusLabels[value] || value;
}

function getVisibleRecords() {
  const query = state.query.trim().toLowerCase();
  const visible = state.records.filter((record) => {
    const searchable = [
      record.title,
      record.subtitle,
      record.domain,
      record.abstract,
      record.outcome,
      record.lesson,
      ...(record.tags || []),
      ...(record.contributors || [])
    ].join(" ").toLowerCase();

    const matchesQuery = !query || searchable.includes(query);
    const matchesDomain = state.domain === "all" || record.domain === state.domain;
    const matchesStatus = state.status === "all" || record.status === state.status;
    return matchesQuery && matchesDomain && matchesStatus;
  });

  return visible.sort((a, b) => {
    if (state.sort === "confidence") return (b.confidence || 0) - (a.confidence || 0);
    if (state.sort === "branches") return (b.timeline?.length || 0) - (a.timeline?.length || 0);
    return String(b.updated).localeCompare(String(a.updated));
  });
}

function renderStats() {
  const domains = new Set(state.records.map((record) => record.domain));
  const contributors = new Set(state.records.flatMap((record) => record.contributors || []));
  const branches = state.records.reduce((total, record) => total + (record.timeline || []).filter((event) => ["failure", "pivot", "open"].includes(event.type)).length, 0);

  elements.statTrails.textContent = state.records.length;
  elements.statDomains.textContent = domains.size;
  elements.statBranches.textContent = branches;
  elements.statContributors.textContent = contributors.size;
}

function populateDomainFilter() {
  const domains = [...new Set(state.records.map((record) => record.domain))].sort();
  elements.domain.innerHTML = '<option value="all">All domains</option>' + domains.map((domain) => `<option value="${escapeHtml(domain)}">${escapeHtml(domain)}</option>`).join("");
}

function renderList() {
  const records = getVisibleRecords();
  elements.list.setAttribute("aria-busy", "false");
  elements.meta.textContent = `${records.length} of ${state.records.length} trails`;

  if (!records.length) {
    elements.list.innerHTML = '<div class="no-results"><strong>No trail matches that view.</strong><p>Try a broader search or reset the filters.</p></div>';
    return;
  }

  if (!records.some((record) => record.id === state.selectedId)) state.selectedId = records[0].id;

  elements.list.innerHTML = records.map((record) => {
    const tags = (record.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    const branches = (record.timeline || []).filter((event) => ["failure", "pivot", "open"].includes(event.type)).length;
    return `
      <button class="record-card ${record.id === state.selectedId ? "is-selected" : ""}" type="button" data-record-id="${escapeHtml(record.id)}" aria-pressed="${record.id === state.selectedId}">
        <span class="record-card-top">
          <span class="card-domain">${escapeHtml(record.domain)}</span>
          <span class="status status--${escapeHtml(record.status)}">${escapeHtml(statusLabel(record.status))}</span>
        </span>
        <h3>${escapeHtml(record.title)}</h3>
        <p>${escapeHtml(record.subtitle)}</p>
        <span class="card-footer">
          <span class="tag-list">${tags}</span>
          <span class="card-meta">${branches} branches · ${escapeHtml(formatDate(record.updated))}</span>
        </span>
      </button>`;
  }).join("");
}

function evidenceIcon(kind) {
  const icons = { artifact: "AR", measurement: "ME", reproduction: "RE", counterexample: "CX", notebook: "NB", generator: "GE", trace: "TR", patch: "PA", "open-question": "?", benchmark: "BE", ablation: "AB", protocol: "PR", decision: "DE", proof: "PF", invariant: "IN" };
  return icons[kind] || "EV";
}

function renderDetail() {
  const record = state.records.find((candidate) => candidate.id === state.selectedId);
  if (!record) {
    elements.detail.innerHTML = '<div class="detail-empty"><div class="empty-mark">✦</div><p class="eyebrow">No trail selected</p><h3>Read the route behind the result.</h3><p>Choose a field note to see its timeline, evidence, and next paths.</p></div>';
    return;
  }

  const events = (record.timeline || []).map((event) => `
    <li class="timeline-item">
      <span class="event-dot event-dot--${escapeHtml(event.type)}"></span>
      <div class="event-content">
        <div class="event-meta"><span>${escapeHtml(formatDate(event.date))}</span><span class="event-type">${escapeHtml(event.type)}</span></div>
        <strong>${escapeHtml(event.label)}</strong>
        <p>${escapeHtml(event.note)}</p>
      </div>
    </li>`).join("");

  const evidence = (record.evidence || []).map((item) => `
    <li class="evidence-item">
      <span class="evidence-icon">${escapeHtml(evidenceIcon(item.kind))}</span>
      <div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.detail)}</p></div>
    </li>`).join("");

  const paths = (record.nextPaths || []).map((path) => `<li>${escapeHtml(path)}</li>`).join("");
  const confidence = Math.round((record.confidence || 0) * 100);

  elements.detail.innerHTML = `
    <article class="detail-content">
      <header class="detail-header">
        <div class="detail-header-top">
          <span class="card-domain">${escapeHtml(record.domain)}</span>
          <span class="status status--${escapeHtml(record.status)}">${escapeHtml(statusLabel(record.status))}</span>
        </div>
        <h2>${escapeHtml(record.title)}</h2>
        <p class="detail-subtitle">${escapeHtml(record.subtitle)}</p>
        <p class="detail-abstract">${escapeHtml(record.abstract)}</p>
        <div class="detail-people">
          <span>by ${escapeHtml((record.contributors || []).join(" · "))}</span>
          <span>updated ${escapeHtml(formatDate(record.updated))}</span>
        </div>
      </header>

      <section class="detail-section">
        <div class="detail-section-heading"><h3>What happened</h3><span class="section-count">01 / outcome</span></div>
        <div class="outcome-box"><strong>Recorded outcome</strong><p>${escapeHtml(record.outcome)}</p></div>
        <p class="lesson">${escapeHtml(record.lesson)}</p>
      </section>

      <section class="detail-section">
        <div class="detail-section-heading"><h3>Trail timeline</h3><span class="section-count">${(record.timeline || []).length} turns</span></div>
        <ol class="timeline">${events}</ol>
      </section>

      <section class="detail-section">
        <div class="detail-section-heading"><h3>Evidence kept with the trail</h3><span class="section-count">${(record.evidence || []).length} items</span></div>
        <ul class="evidence-list">${evidence}</ul>
      </section>

      <section class="detail-section">
        <div class="detail-section-heading"><h3>Next paths</h3><span class="section-count">not a conclusion</span></div>
        <ul class="next-paths">${paths}</ul>
      </section>

      <footer class="detail-footer">
        <span>${escapeHtml(record.provenance?.recordedBy || "Unknown recorder")} · ${escapeHtml(record.provenance?.license || "Unlicensed")}</span>
        <span class="confidence"><span>confidence</span><span class="confidence-track"><span class="confidence-fill" style="width: ${confidence}%"></span></span><span>${confidence}%</span></span>
      </footer>
    </article>`;
}

function render() {
  renderStats();
  renderList();
  renderDetail();
}

function resetFilters() {
  state.query = "";
  state.domain = "all";
  state.status = "all";
  state.sort = "recent";
  elements.search.value = "";
  elements.domain.value = "all";
  elements.status.value = "all";
  elements.sort.value = "recent";
  render();
}

function localDraftRecords() {
  try {
    return JSON.parse(localStorage.getItem("sidelore.localDrafts") || "[]").map((draft) => ({
      id: draft.id,
      title: draft.title,
      subtitle: "Local draft · not published",
      domain: draft.domain || "Unsorted",
      status: "unresolved",
      visibility: "private",
      confidence: 0,
      updated: draft.updated,
      contributors: ["You"],
      tags: draft.tags || [],
      abstract: draft.abstract || "",
      outcome: "This trail is still a draft. Add an event before publishing.",
      lesson: "A local draft remains on this device until you explicitly export or publish it.",
      timeline: [{ date: draft.updated, type: "hypothesis", label: "Draft started", note: draft.abstract || "No note yet." }],
      evidence: [],
      nextPaths: ["Add the first experiment, failure, or open question."],
      provenance: { authorType: "human", recordedBy: "Local browser", license: "CC BY 4.0" }
    }));
  } catch (error) {
    console.warn("Sidelore local drafts could not be loaded:", error);
    return [];
  }
}

function openComposer() {
  elements.composerPanel.hidden = false;
  elements.composerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.composerForm?.querySelector("input[name=title]")?.focus();
}

function closeComposer() {
  elements.composerPanel.hidden = true;
  elements.composerStatus.textContent = "";
}

function saveLocalDraft(event) {
  event.preventDefault();
  const form = new FormData(elements.composerForm);
  const title = String(form.get("title") || "").trim();
  if (!title) return;
  const updated = new Date().toISOString().slice(0, 10);
  const draft = {
    id: `draft-${Date.now().toString(36)}`,
    title,
    abstract: String(form.get("abstract") || "").trim(),
    domain: String(form.get("domain") || "").trim(),
    tags: String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    updated
  };
  const drafts = JSON.parse(localStorage.getItem("sidelore.localDrafts") || "[]");
  drafts.unshift(draft);
  localStorage.setItem("sidelore.localDrafts", JSON.stringify(drafts));
  state.records = [localDraftRecords()[0], ...state.records];
  state.selectedId = draft.id;
  populateDomainFilter();
  render();
  elements.composerStatus.textContent = "Saved on this device. Export or publish it when you are ready.";
  elements.composerForm.reset();
  setTimeout(closeComposer, 1800);
}

function exportLocalDrafts() {
  const payload = localStorage.getItem("sidelore.localDrafts") || "[]";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  link.download = "sidelore-local-drafts.json";
  link.click();
  URL.revokeObjectURL(link.href);
  elements.composerStatus.textContent = "Drafts exported from this device.";
}

async function importLocalDrafts(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming)) throw new Error("Expected an array of drafts");
    const current = JSON.parse(localStorage.getItem("sidelore.localDrafts") || "[]");
    const merged = [...incoming, ...current].filter((draft, index, all) => draft?.id && all.findIndex((candidate) => candidate.id === draft.id) === index);
    localStorage.setItem("sidelore.localDrafts", JSON.stringify(merged));
    state.records = [...state.records.filter((record) => !String(record.id).startsWith("draft-")), ...localDraftRecords()];
    populateDomainFilter();
    render();
    elements.composerStatus.textContent = `Imported ${incoming.length} local draft${incoming.length === 1 ? "" : "s"}.`;
  } catch (error) {
    elements.composerStatus.textContent = error instanceof Error ? error.message : "Could not import drafts.";
  } finally {
    event.target.value = "";
  }
}

async function loadRecords() {
  state.records = localDraftRecords();
  populateDomainFilter();
  state.selectedId = state.records[0]?.id || null;
  render();
}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

elements.domain.addEventListener("change", (event) => {
  state.domain = event.target.value;
  render();
});

elements.status.addEventListener("change", (event) => {
  state.status = event.target.value;
  render();
});

elements.sort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

elements.clear.addEventListener("click", resetFilters);

elements.list.addEventListener("click", (event) => {
  const card = event.target.closest("[data-record-id]");
  if (!card) return;
  state.selectedId = card.dataset.recordId;
  render();
  if (window.matchMedia("(max-width: 800px)").matches) elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.openComposer?.addEventListener("click", openComposer);
elements.closeComposer?.addEventListener("click", closeComposer);
elements.composerForm?.addEventListener("submit", saveLocalDraft);
elements.exportDrafts?.addEventListener("click", exportLocalDrafts);
elements.importDrafts?.addEventListener("change", importLocalDrafts);

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch((error) => console.warn("Sidelore offline shell unavailable:", error));
}

loadRecords();
