import { LocalResearchService, type LocalCaller } from "./local-service.js";
import { handleAgentMcp } from "./agent-mcp.js";
import { ResearchNetwork } from "./network.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { URL } from "node:url";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import {
  verifyEvent,
  scanPublication,
  type Bundle,
  type Draft,
  type Event,
  type Fork,
  type Identity,
  type MembershipChange,
  type NetworkMode,
  type NetworkPolicy,
  type Report,
  type ReplicationPolicy,
  type ResearchSubproblem,
  type ResearchTopic,
  type ResearchTrail,
  type Review,
  type Tombstone,
  type TopicActivity,
  type TopicReview,
} from "../../../packages/core/src/index.js";
import {
  SideloreStore,
  LocalKeyStore,
} from "../../../packages/storage/src/index.js";
import {
  verifyPeerCard,
  type PeerCard,
} from "../../../packages/sync/src/index.js";

const PORT = Number(process.env.SIDELORE_PORT ?? 8787);
const DATA_DIR =
  process.env.SIDELORE_DATA_DIR ?? resolve(process.cwd(), ".sidelore");
const DB_PATH = process.env.SIDELORE_DB ?? resolve(DATA_DIR, "node.sqlite");
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const API_TOKEN = process.env.SIDELORE_API_TOKEN;

export interface SideloreServer {
  server: ReturnType<typeof createServer>;
  store: SideloreStore;
  localService: LocalResearchService;
  operatorToken: string;
  close(): Promise<void>;
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? Number(item) : item,
  );
}

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const text = typeof body === "string" ? body : json(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",

    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    ...headers,
  });
  response.end(text);
}

async function readJson(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds 10 MiB");
    chunks.push(bytes);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function pathParts(pathname: string): string[] {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

function policyFromQuery(url: URL): ReplicationPolicy | undefined {
  const list = (key: string) =>
    url.searchParams
      .get(key)
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  const artifacts = url.searchParams.get("artifacts") as
    ReplicationPolicy["artifacts"] | null;
  const policy: ReplicationPolicy = {
    domains: list("domain"),
    authors: list("author"),
    since: url.searchParams.get("since") ?? undefined,
    artifacts: artifacts ?? undefined,
    maxArtifactBytes: url.searchParams.has("maxArtifactBytes")
      ? Number(url.searchParams.get("maxArtifactBytes"))
      : undefined,
    mediaTypes: list("mediaType"),
  };
  return Object.values(policy).some((value) => value !== undefined)
    ? policy
    : undefined;
}

function cryptoRandomId(): string {
  return randomUUID();
}

export function createSideloreServer(
  options: {
    dbPath?: string;
    store?: SideloreStore;
    networkMode?: NetworkMode;
    networkId?: string;
    bridgeEnabled?: boolean;
    directoryEnabled?: boolean;
    surface?: "public" | "local";
    operatorToken?: string;
    localService?: LocalResearchService;
    vaultPath?: string;
  } = {},
): SideloreServer {
  const configuredMode =
    options.networkMode ??
    (process.env.SIDELORE_NETWORK_MODE as NetworkMode | undefined) ??
    "isolated";
  const store =
    options.store ??
    new SideloreStore(options.dbPath ?? DB_PATH, {
      networkMode: configuredMode,
      networkId: options.networkId,
      bridgeEnabled: options.bridgeEnabled,
      directoryEnabled: options.directoryEnabled,
    });
  const surface = options.surface ?? "public";
  const operatorToken =
    options.operatorToken ??
    process.env.SIDELORE_OPERATOR_TOKEN ??
    randomBytes(32).toString("base64url");
  const localService =
    options.localService ??
    new LocalResearchService(
      store,
      new LocalKeyStore(
        options.vaultPath ?? resolve(DATA_DIR, "identity-vault.json"),
      ),
    );
  localService.network ??= new ResearchNetwork(store, () =>
    localService.transportKey(),
  );
  const publicPath = (path: string, method?: string) =>
    (method === "GET" &&
      (/^\/v1\/(health|trails(?:\/[^/]+)?|search|topics(?:\/[^/]+(?:\/(subproblems|activities))?)?|branches\/[^/]+|events\/[^/]+|artifacts\/[^/]+|evidence\/[^/]+|directory\/topics|sync\/manifest|export)$/.test(
        path,
      ) ||
        path.startsWith("/v2/publications"))) ||
    (method === "POST" && ["/v1/verify", "/v1/sync/content"].includes(path));
  const respond = (
    response: ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    if (surface === "public" && status === 200)
      store.publications.notePublicRead(body);
    send(response, status, body, headers);
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "OPTIONS")
        return respond(
          response,
          204,
          {},
          surface === "public" ? { "access-control-allow-origin": "*" } : {},
        );
      if (surface === "public") {
        if (
          API_TOKEN &&
          request.headers.authorization !== `Bearer ${API_TOKEN}`
        )
          return respond(response, 401, { error: "Authorization required" });
        if (store.networkMode() === "isolated" && url.pathname !== "/v1/health")
          return respond(response, 403, {
            error: "Public access is disabled for this network",
          });
        if (!publicPath(url.pathname, request.method))
          return respond(response, 404, {
            error: "Local operation is not exposed on the public service",
          });
        if (url.searchParams.get("publicOnly") === "false")
          return respond(response, 403, {
            error: "Workspace content requires the local interface",
          });
        response.setHeader("access-control-allow-origin", "*");
      } else {
        const address = request.socket.remoteAddress;
        if (
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "") ||
          request.headers.origin
        )
          return respond(response, 403, {
            error: "Use the trusted local desktop or CLI",
          });
        const supplied = String(request.headers.authorization ?? "").replace(
          /^Bearer /,
          "",
        );
        const isOperator =
          supplied.length === operatorToken.length &&
          timingSafeEqual(Buffer.from(supplied), Buffer.from(operatorToken));
        const caller: LocalCaller | undefined = isOperator
          ? { role: "human" }
          : localService.authenticateAgent(supplied);
        if (!caller)
          return respond(response, 401, {
            error: "Local capability token required",
          });
        if (url.pathname === "/local" && request.method === "POST") {
          const body = await readJson(request);
          return respond(
            response,
            200,
            await localService.call(String(body.method), body.args, caller),
          );
        }
        if (url.pathname === "/mcp" && request.method === "POST")
          return respond(
            response,
            200,
            await handleAgentMcp(localService, caller, await readJson(request)),
          );
        if (caller.role === "agent")
          return respond(response, 403, {
            error: "Use the scoped local Agent API",
          });
      }
      if (
        url.pathname === "/v1/publish_trail" ||
        (request.method === "POST" && url.pathname === "/v1/trails")
      )
        return respond(response, 409, {
          error:
            "PUBLICATION_AUTHORIZATION_REQUIRED: save locally, prepare an immutable snapshot, then approve its CID",
        });
      if (request.method === "GET" && url.pathname === "/v2/publications")
        return respond(
          response,
          200,
          store.publications.page(
            store.networkId(),
            url.searchParams.get("topicId") ?? "",
            Number(url.searchParams.get("after") ?? 0),
            Number(url.searchParams.get("limit") ?? 100),
          ),
        );
      if (
        request.method === "GET" &&
        url.pathname.startsWith("/v2/publications/")
      ) {
        const cid = decodeURIComponent(
          url.pathname.slice("/v2/publications/".length),
        );
        const publication = store.publications.get(cid, store.networkId());
        if (!publication)
          return respond(response, 404, { error: "Publication not found" });
        store.publications.sent(cid);
        return respond(response, 200, publication);
      }
      const parts = pathParts(url.pathname);
      if (request.method === "GET" && url.pathname === "/v1/health") {
        respond(response, 200, {
          ok: true,
          nodeId: store.nodeId,
          protocol: "sidelore/2",
          release: "self-hosted-testnet",
          networkMode: store.networkMode(),
          networkId: store.networkId(),
          bridgeEnabled: store.bridgeEnabled(),
          directoryEnabled: store.directoryEnabled(),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/identity") {
        respond(response, 200, { identities: store.listIdentities() });
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "identities"
      ) {
        const body = (await readJson(request)) as { identity?: Identity };
        if (!body.identity) throw new Error("identity is required");
        store.registerIdentity(body.identity);
        respond(response, 201, body.identity);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/network/policy") {
        respond(
          response,
          200,
          store.getNetworkPolicy() ?? {
            networkId: store.networkId(),
            mode: store.networkMode(),
            directoryEnabled: store.directoryEnabled(),
            bridgeEnabled: store.bridgeEnabled(),
            members: store.listMembers(),
          },
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/network/policy") {
        const body = (await readJson(request)) as {
          policy?: NetworkPolicy;
          identity?: Identity;
          identities?: Identity[];
        };
        for (const identity of [
          ...(body.identities ?? []),
          ...(body.identity ? [body.identity] : []),
        ])
          store.registerIdentity(identity);
        if (!body.policy) throw new Error("policy is required");
        store.saveNetworkPolicy(body.policy);
        respond(response, 201, body.policy);
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/membership/changes"
      ) {
        respond(response, 200, {
          changes: store.listMembershipChanges(),
          members: store.listMembers(),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/directory/topics") {
        if (!store.directoryEnabled())
          return respond(response, 403, {
            error: "Directory publication is disabled by the network policy",
          });
        respond(response, 200, {
          nodeId: store.nodeId,
          topics: store.searchTopics({
            publicOnly: true,
            query: url.searchParams.get("q") ?? undefined,
            domain: url.searchParams.get("domain") ?? undefined,
            limit: Number(url.searchParams.get("limit") ?? 100),
          }),
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/membership/changes"
      ) {
        const body = (await readJson(request)) as {
          change?: MembershipChange;
          identity?: Identity;
          identities?: Identity[];
        };
        for (const identity of [
          ...(body.identities ?? []),
          ...(body.identity ? [body.identity] : []),
        ])
          store.registerIdentity(identity);
        if (!body.change) throw new Error("change is required");
        store.saveMembershipChange(body.change);
        respond(response, 201, body.change);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/topics") {
        respond(response, 200, {
          topics: store.searchTopics({
            query:
              url.searchParams.get("q") ??
              url.searchParams.get("query") ??
              undefined,
            domain: url.searchParams.get("domain") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
            visibility: url.searchParams.get("visibility") ?? undefined,
            publicOnly: url.searchParams.get("publicOnly") !== "false",
            limit: Number(url.searchParams.get("limit") ?? 100),
          }),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/topics") {
        const body = (await readJson(request)) as {
          topic?: ResearchTopic;
          identity?: Identity;
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (!body.topic) throw new Error("topic is required");
        store.saveTopic(body.topic);
        respond(response, 201, body.topic);
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "topics" &&
        parts[2] &&
        !parts[3]
      ) {
        const publicOnly = url.searchParams.get("publicOnly") !== "false";
        const record = store.getTopicRecord(parts[2], { publicOnly });
        if (!record)
          return respond(response, 404, { error: "Topic not found" });
        respond(response, 200, record);
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "topics" &&
        parts[2] &&
        parts[3] === "subproblems"
      ) {
        const topic = store.getTopicRecord(parts[2], {
          publicOnly: true,
        })?.topic;
        if (!topic) return respond(response, 404, { error: "Topic not found" });
        respond(response, 200, {
          subproblems:
            store.getTopicRecord(parts[2], { publicOnly: true })?.subproblems ??
            [],
        });
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "topics" &&
        parts[2] &&
        parts[3] === "subproblems"
      ) {
        const body = (await readJson(request)) as {
          subproblem?: ResearchSubproblem;
          identity?: Identity;
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (!body.subproblem) throw new Error("subproblem is required");
        if (body.subproblem.topicId !== parts[2])
          throw new Error("Subproblem topicId does not match the URL");
        store.saveSubproblem(body.subproblem);
        respond(response, 201, body.subproblem);
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "topics" &&
        parts[2] &&
        parts[3] === "activities"
      ) {
        const topic = store.getTopicRecord(parts[2], {
          publicOnly: true,
        })?.topic;
        if (!topic) return respond(response, 404, { error: "Topic not found" });
        respond(response, 200, {
          activities:
            store.getTopicRecord(parts[2], { publicOnly: true })?.activities ??
            [],
        });
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "topics" &&
        parts[2] &&
        parts[3] === "activities"
      ) {
        const body = (await readJson(request)) as {
          activity?: TopicActivity;
          identity?: Identity;
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (!body.activity) throw new Error("activity is required");
        if (body.activity.topicId !== parts[2])
          throw new Error("Activity topicId does not match the URL");
        store.saveTopicActivity(body.activity);
        respond(response, 201, body.activity);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/topic-reviews") {
        const body = (await readJson(request)) as {
          review?: TopicReview;
          identity?: Identity;
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (!body.review) throw new Error("review is required");
        store.saveTopicReview(body.review);
        respond(response, 201, body.review);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/bridge/export") {
        if (!store.bridgeEnabled())
          return respond(response, 403, {
            error: "Bridge is disabled; enable it with a signed network policy",
          });
        const body = (await readJson(request)) as {
          intentId: string;
          contentCid: string;
        };
        const intent = store.publications.intent(body.intentId);
        if (
          !intent.bridge ||
          intent.contentCid !== body.contentCid ||
          !store.publications.canSend(intent)
        )
          return respond(response, 409, {
            error: "Approved Bridge snapshot required",
          });
        const publication = store.publications.get(
          intent.contentCid,
          intent.snapshot.networkId,
        );
        store.publications.sent(intent.contentCid);
        respond(response, 200, publication);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/bridge/import") {
        if (!store.bridgeEnabled())
          return respond(response, 403, {
            error: "Bridge is disabled; enable it with a signed network policy",
          });
        const body = (await readJson(request)) as {
          bundle?: Bundle;
          publicOnly?: boolean;
        };
        if (!body.bundle) throw new Error("bundle is required");
        respond(
          response,
          200,
          store.importBundle(body.bundle, {
            publicOnly: body.publicOnly === true,
          }),
        );
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "drafts"
      ) {
        const body = await readJson(request);
        const now = new Date().toISOString();
        const draft: Draft = body.draft ?? {
          draftId: `draft-${cryptoRandomId()}`,
          trail: {
            title: String(body.title ?? "Untitled research trail"),
            abstract: String(body.abstract ?? ""),
            domains: body.domains ?? [],
            tags: body.tags ?? [],
            status: "draft",
            visibility: body.visibility ?? "public",
          },
          events: [],
          createdAt: now,
          updatedAt: now,
          published: false,
        };
        respond(response, 201, store.saveDraft(draft));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/drafts") {
        respond(response, 200, { drafts: store.listDrafts() });
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "drafts" &&
        parts[2]
      ) {
        const draft = store.getDraft(parts[2]);
        if (!draft) return respond(response, 404, { error: "Draft not found" });
        respond(response, 200, draft);
        return;
      }
      if (
        request.method === "GET" &&
        (url.pathname === "/v1/trails" || url.pathname === "/v1/search")
      ) {
        respond(response, 200, {
          trails: store.searchTrails({
            query:
              url.searchParams.get("q") ??
              url.searchParams.get("query") ??
              undefined,
            domain: url.searchParams.get("domain") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
            visibility: url.searchParams.get("visibility") ?? undefined,
            limit: Number(url.searchParams.get("limit") ?? 100),
            publicOnly: true,
          }),
        });
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "trails" &&
        parts[2]
      ) {
        const record = store.getPublicTrailRecord(parts[2]);
        if (!record)
          return respond(response, 404, { error: "Trail not found" });
        respond(response, 200, record);
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "branches" &&
        parts[2]
      ) {
        const record = store.getPublicTrailRecord(parts[2]);
        if (!record)
          return respond(response, 404, { error: "Trail branch not found" });
        respond(response, 200, record);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "trails"
      ) {
        const body = (await readJson(request)) as {
          identity?: Identity;
          trail?: ResearchTrail;
          events?: Event[];
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (!body.trail) throw new Error("trail is required");
        const record = store.publish(body.trail, body.events ?? []);
        respond(response, 201, record);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        (parts[1] === "publish_trail" || parts[1] === "append_event")
      ) {
        const body = (await readJson(request)) as {
          identity?: Identity;
          trail?: ResearchTrail;
          events?: Event[];
          event?: Event;
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (parts[1] === "append_event") {
          if (!body.event) throw new Error("event is required");
          respond(response, 201, store.appendEvent(body.event));
        } else {
          if (!body.trail) throw new Error("trail is required");
          respond(response, 201, store.publish(body.trail, body.events ?? []));
        }
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "events" &&
        parts[2]
      ) {
        const event = store.getPublicEvent(parts[2]);
        if (!event) return respond(response, 404, { error: "Event not found" });
        respond(response, 200, event);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "events"
      ) {
        const body = (await readJson(request)) as {
          identity?: Identity;
          event?: Event;
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (!body.event) throw new Error("event is required");
        respond(response, 201, store.appendEvent(body.event));
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "verify"
      ) {
        const body = (await readJson(request)) as {
          event?: Event;
          identity?: Identity;
        };
        if (!body.event) throw new Error("event is required");
        const identity =
          body.identity ??
          (surface === "public"
            ? store.publications.view()
            : store
          ).getIdentity(body.event.authorIdentityId);
        respond(response, 200, {
          valid: Boolean(identity && verifyEvent(body.event, identity)),
          eventId: body.event.eventId,
          contentCid: body.event.contentCid,
        });
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "scan"
      ) {
        const body = await readJson(request);
        respond(response, 200, scanPublication(body));
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "reviews"
      ) {
        const body = (await readJson(request)) as Review;
        store.saveReview(body);
        respond(response, 201, body);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "citations"
      ) {
        const body = (await readJson(request)) as {
          identity?: Identity;
          event?: Event;
        };
        if (body.identity) store.registerIdentity(body.identity);
        if (!body.event)
          throw new Error(
            "A signed citation event is required; citations are carried by immutable events",
          );
        if (!body.event.citationRefs?.length)
          throw new Error(
            "Citation event must contain at least one citation reference",
          );
        respond(response, 201, store.appendEvent(body.event));
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "forks"
      ) {
        const body = (await readJson(request)) as Fork;
        store.saveFork(body);
        respond(response, 201, body);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "tombstones"
      ) {
        const body = (await readJson(request)) as Tombstone;
        store.saveTombstone(body);
        respond(response, 201, body);
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "reports"
      ) {
        const body = (await readJson(request)) as Report;
        store.saveReport(body);
        respond(response, 201, body);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/reports") {
        respond(response, 200, { reports: store.listReports() });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/moderation") {
        const body = (await readJson(request)) as {
          targetId: string;
          hidden: boolean;
          reason: string;
          operator: string;
          reportId?: string;
        };
        store.moderate(body);
        respond(response, 200, body);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/audit") {
        respond(response, 200, { entries: store.auditLog() });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/maintenance/retention"
      ) {
        const body = (await readJson(request)) as { now?: string };
        respond(response, 200, {
          purged: store.purgeExpiredArtifacts(body.now),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/stats") {
        respond(response, 200, store.stats());
        return;
      }
      if (
        request.method === "POST" &&
        parts[0] === "v1" &&
        parts[1] === "artifacts"
      ) {
        const body = (await readJson(request)) as {
          artifact: any;
          data?: string;
        };
        if (!body.artifact?.cid) throw new Error("artifact.cid is required");
        store.saveArtifact(
          body.artifact,
          body.data ? Buffer.from(body.data, "base64url") : undefined,
        );
        respond(response, 201, body.artifact);
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "artifacts" &&
        parts[2]
      ) {
        const artifact = store.getPublicArtifact(parts[2]);
        if (!artifact)
          return respond(response, 404, { error: "Artifact not available" });
        if (artifact.data) {
          store.publications.notePublicRead(
            store.getPublicEvent(artifact.artifact.sourceEventId ?? ""),
          );
          response.writeHead(200, {
            "content-type": artifact.artifact.mediaType,
            "content-length": String(artifact.data.byteLength),
            "content-disposition": `attachment; filename="${artifact.artifact.cid}"`,
            "x-content-type-options": "nosniff",
            "content-security-policy": "sandbox; default-src 'none'",
            "access-control-allow-origin": "*",
          });
          response.end(Buffer.from(artifact.data));
        } else respond(response, 200, artifact.artifact);
        return;
      }
      if (
        request.method === "GET" &&
        parts[0] === "v1" &&
        parts[1] === "evidence" &&
        parts[2]
      ) {
        const artifact = store.getPublicArtifact(parts[2]);
        if (!artifact)
          return respond(response, 404, { error: "Evidence not available" });
        respond(response, 200, artifact.artifact);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/sync/manifest") {
        if (!store.canFederate())
          return respond(response, 403, {
            error: "Federation is disabled on this isolated node",
          });
        respond(response, 200, store.manifest(policyFromQuery(url)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/sync/pull") {
        if (!store.canFederate())
          return respond(response, 403, {
            error: "Federation is disabled on this isolated node",
          });
        const body = (await readJson(request)) as { bundle: Bundle };
        if (!body.bundle) throw new Error("bundle is required");
        respond(
          response,
          200,
          store.importBundle(body.bundle, { publicOnly: true }),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/sync/content") {
        if (!store.canFederate())
          return respond(response, 403, {
            error: "Federation is disabled on this isolated node",
          });
        const body = (await readJson(request)) as {
          eventCids?: string[];
          artifactCids?: string[];
          trailIds?: string[];
          topicIds?: string[];
          subproblemIds?: string[];
          policy?: any;
          includeArtifactData?: boolean;
        };
        respond(response, 200, store.exportContent(body));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/export") {
        if (!store.canFederate())
          return respond(response, 403, {
            error: "Public federation export is disabled on this isolated node",
          });
        respond(response, 200, store.exportBundle({ publicOnly: true }), {
          "content-disposition":
            'attachment; filename="sidelore-public.bundle.json"',
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/backup") {
        respond(response, 200, store.exportBundle(), {
          "content-disposition":
            'attachment; filename="sidelore-backup.bundle.json"',
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/import") {
        const body = (await readJson(request)) as Bundle;
        respond(response, 200, store.importBundle(body));
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/peers") {
        if (!store.canFederate())
          return respond(response, 403, {
            error: "Peer discovery is disabled on this isolated node",
          });
        respond(response, 200, { peers: store.listPeers() });
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/peers") {
        if (!store.canFederate())
          return respond(response, 403, {
            error: "Peer discovery is disabled on this isolated node",
          });
        const body = (await readJson(request)) as Record<string, unknown>;
        if (!body.peerId) throw new Error("peerId is required");
        if (body.signature && !verifyPeerCard(body as unknown as PeerCard))
          throw new Error("Peer card signature verification failed");
        store.savePeer(String(body.peerId), body);
        respond(response, 201, body);
        return;
      }
      respond(response, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      respond(
        response,
        /required|invalid|verification|unknown|exceeds|collision|missing/i.test(
          message,
        )
          ? 400
          : 500,
        { error: message },
      );
    }
  });
  return {
    server,
    store,
    localService,
    operatorToken,
    close: async () => {
      await localService.network?.disconnect(false);
      localService.lock();
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) =>
          error &&
          (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
            ? reject(error)
            : resolveClose(),
        ),
      );
      store.close();
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  const app = createSideloreServer();
  const start = async () => {
    await new Promise<void>((resolveListen) =>
      app.server.listen(PORT, "127.0.0.1", resolveListen),
    );
    console.log(`Sidelore node listening at http://127.0.0.1:${PORT}`);
    let p2p:
      | { start(): Promise<void>; stop(): Promise<void>; address(): unknown }
      | undefined;
    if (process.env.SIDELORE_P2P === "1") {
      const { createNodeP2PService } = await import("./p2p.js");
      const service = await createNodeP2PService(app.store, {
        listen: (process.env.SIDELORE_P2P_LISTEN ?? "/ip4/127.0.0.1/tcp/0")
          .split(",")
          .filter(Boolean),
      });
      p2p = service;
      await service.start();
      console.log(
        `Sidelore P2P node listening at ${service.address()?.toString() ?? "unavailable"}`,
      );
    }
    const shutdown = async () => {
      await p2p?.stop();
      await app.close();
    };
    process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
    process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  };
  void start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
