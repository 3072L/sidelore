import { randomBytes, randomUUID, createHash } from "node:crypto";
import { privateKeyFromRaw } from "@libp2p/crypto/keys";
import {
  createIdentity,
  createTrailDraft,
  createFirstEvent,
  createSignedEvent,
  createResearchTopic,
  createResearchSubproblem,
  createTopicActivity,
  createSignedTopicReview,
  createNetworkPolicy,
  canonicalBytes,
  signBytes,
  verifyBytes,
  isValidIdentity,
  recordKinds,
  recordId,
  cidFromBytes,
  cidFromValue,
  lockSecret,
  type IdentityKeyPair,
  type PreparePublicationInput,
  type NetworkProfile,
  type RecordRef,
} from "../../../packages/core/src/index.js";
import {
  LocalKeyStore,
  SideloreStore,
} from "../../../packages/storage/src/index.js";

export type LocalCaller =
  { role: "human" } | { role: "agent"; agentId: string; workspaceId: string; signingIdentityId?: string };
export interface NetworkController {
  connect(networkId: string): Promise<unknown>;
  disconnect(clearPreference?: boolean): Promise<unknown>;
  status(): unknown;
  sync(): Promise<unknown>;
  search(query: string): Promise<unknown>;
  fetchArtifact(cid: string): Promise<unknown>;
}
const digest = (v: string) => createHash("sha256").update(v).digest("hex");

/** Shared by desktop IPC and authenticated loopback CLI/MCP. Never exposes signing keys. */
export class LocalResearchService {
  private signer?: IdentityKeyPair;
  network?: NetworkController;
  constructor(
    readonly store: SideloreStore,
    private vault: LocalKeyStore,
  ) {}
  identity() {
    return {
      identity:
        this.signer?.identity ??
        this.store.getIdentity(
          this.store.getSetting<string>("local_identity") ?? "",
        ),
      locked: !this.signer,
    };
  }
  private requireSigner() {
    if (!this.signer) throw new Error("Local identity vault is locked");
    return this.signer;
  }
  transportKey() {
    return privateKeyFromRaw(
      Buffer.from(this.requireSigner().privateKey, "base64url"),
    );
  }
  lock() {
    this.signer = undefined;
  }
  initialize(displayName: string, passphrase: string) {
    if (this.store.getSetting("local_identity"))
      throw new Error(
        "An identity already exists; unlock or use verified migration",
      );
    const pair = createIdentity(displayName || "Researcher");
    this.vault.put(pair, passphrase);
    this.signer = this.vault.get(pair.identity.identityId, passphrase);
    this.store.registerIdentity(pair.identity);
    this.store.setSetting("local_identity", pair.identity.identityId);
    return this.identity();
  }
  unlock(passphrase: string) {
    const id = this.store.getSetting<string>("local_identity");
    if (!id) throw new Error("Initialize an identity first");
    this.signer = this.vault.get(id, passphrase);
    if (!this.signer) throw new Error("Identity missing from vault");
    return this.identity();
  }
  migrateIdentity(pair: IdentityKeyPair, passphrase: string) {
    if (!isValidIdentity(pair.identity))
      throw new Error("Invalid legacy identity");
    const challenge = canonicalBytes({ challenge: randomUUID() });
    if (
      !verifyBytes(
        challenge,
        signBytes(challenge, pair.privateKey),
        pair.identity.primaryPublicKey,
      )
    )
      throw new Error("Legacy private key verification failed");
    this.vault.put(pair, passphrase);
    const verified = this.vault.get(pair.identity.identityId, passphrase);
    if (
      !verified ||
      !verifyBytes(
        challenge,
        signBytes(challenge, verified.privateKey),
        pair.identity.primaryPublicKey,
      )
    )
      throw new Error("Vault migration verification failed");
    this.store.registerIdentity(pair.identity);
    this.store.setSetting("local_identity", pair.identity.identityId);
    this.signer = verified;
    return { verified: true, identity: pair.identity };
  }
  authenticateAgent(token: string): LocalCaller | undefined {
    const tokens =
      this.store.getSetting<
        Array<{
          hash: string;
          agentId: string;
          workspaceId: string;
          signingIdentityId?: string;
          revoked?: boolean;
        }>
      >("agent_credentials") ?? [];
    const found = tokens.find((t) => !t.revoked && t.hash === digest(token));
    return found
      ? {
          role: "agent",
          agentId: found.agentId,
          workspaceId: found.workspaceId,
          signingIdentityId: found.signingIdentityId,
        }
      : undefined;
  }
  private issueAgent(agentId: string, workspaceId: string) {
    if (
      !agentId ||
      !this.store.publications
        .workspaces()
        .some((w) => w.workspaceId === workspaceId)
    )
      throw new Error("Invalid agent or workspace");
    const token = randomBytes(32).toString("base64url");
    const saved = this.store.getSetting<any[]>("agent_credentials") ?? [];
    const signingPair = createIdentity(agentId, "agent");
    this.vault.put(signingPair, this.requireSigner().privateKey);
    this.store.registerIdentity(signingPair.identity);
    saved.push({ hash: digest(token), agentId, workspaceId, signingIdentityId: signingPair.identity.identityId });
    this.store.setSetting("agent_credentials", saved);
    return { token, agentId, workspaceId, signingIdentity: signingPair.identity };
  }
  async call(
    method: string,
    args: any = {},
    caller: LocalCaller = { role: "human" },
  ): Promise<any> {
    const p = this.store.publications;
    const human = caller.role === "human";
    const humanMethods = new Set([
      "identity.initialize",
      "identity.unlock",
      "identity.lock",
      "identity.migrate",
      "identity.backup",
      "identity.restore",
      "workspace.create",
      "network.save",
      "network.connect",
      "network.disconnect",
      "agent.create",
      "agent.revoke",
      "grant.create",
      "grant.revoke",
      "grant.list",
      "publication.approve",
      "publication.cancel",
      "backup.export",
      "backup.restore",
      "bridge.prepare",
      "bridge.enable",
      "bridge.export",
      "bridge.import",
    ]);
    if (humanMethods.has(method) && !human)
      throw new Error("Human-only local operation");
    const workspaceId = human
      ? (args.workspaceId ?? "local")
      : caller.workspaceId;
    if (!human && args.workspaceId && args.workspaceId !== workspaceId)
      throw new Error("Agent workspace scope mismatch");
    switch (method) {
      case "identity.status":
        return this.identity();
      case "identity.initialize":
        return this.initialize(
          String(args.displayName ?? "Researcher"),
          String(args.passphrase ?? ""),
        );
      case "identity.unlock":
        return this.unlock(String(args.passphrase ?? ""));
      case "identity.lock":
        this.lock();
        return this.identity();
      case "identity.migrate":
        return this.migrateIdentity(args.keyPair, args.passphrase);
      case "identity.backup": {
        if (typeof args.passphrase !== "string" || args.passphrase.length < 10)
          throw new Error(
            "Choose a backup passphrase of at least ten characters",
          );
        const pair = this.requireSigner();
        return {
          [pair.identity.identityId]: {
            identity: pair.identity,
            vault: lockSecret(pair.privateKey, args.passphrase),
          },
        };
      }
      case "identity.restore": {
        const pair = this.vault.restoreEncrypted(
          args.backup,
          args.identityId,
          args.passphrase,
        );
        const result = this.migrateIdentity(pair, args.passphrase);
        p.restoreOffline();
        await this.network?.disconnect();
        const body = {
          identityId: pair.identity.identityId,
          backupCid: cidFromValue(args.backup),
          verifiedAt: new Date().toISOString(),
        };
        return {
          ...result,
          receipt: {
            ...body,
            signature: signBytes(canonicalBytes(body), pair.privateKey),
          },
        };
      }
      case "workspace.list":
        return p
          .workspaces()
          .filter((w) => human || w.workspaceId === workspaceId);
      case "workspace.create":
        return p.saveWorkspace({
          workspaceId: randomUUID(),
          name: args.name,
          classification: args.classification,
          createdAt: new Date().toISOString(),
        });
      case "network.list":
        return p.profiles();
      case "network.save":
        return p.saveProfile(args.profile as NetworkProfile);
      case "network.status":
        return (
          this.network?.status() ?? {
            connected: false,
            release: "self-hosted-testnet",
          }
        );
      case "network.search":
        return this.network?.search(String(args.query ?? "")) ?? [];
      case "artifact.fetch":
        return this.network?.fetchArtifact(String(args.cid));
      case "network.connect":
        if (!this.network) throw new Error("Network controller unavailable");
        return this.network.connect(args.networkId);
      case "network.disconnect":
        return this.network?.disconnect() ?? { connected: false };
      case "network.sync":
        return this.network?.sync();
      case "subscription.list":
        return p.subscriptions();
      case "subscription.add":
        return p.subscribe(args.networkId, args.topicId, args.rootCid);
      case "subscription.remove":
        p.unsubscribe(args.networkId, args.topicId);
        return { removed: true };
      case "agent.create":
        return this.issueAgent(args.agentId, args.workspaceId);
      case "agent.revoke": {
        const tokens = this.store.getSetting<any[]>("agent_credentials") ?? [];
        for (const t of tokens)
          if (t.agentId === args.agentId) t.revoked = true;
        this.store.setSetting("agent_credentials", tokens);
        for (const g of p.grants())
          if (g.agentId === args.agentId) p.revokeGrant(g.grantId);
        return { revoked: true };
      }
      case "grant.list":
        return p.grants();
      case "grant.create":
        return p.createGrant(args);
      case "grant.revoke":
        return p.revokeGrant(args.grantId);
      case "bridge.enable": {
        const policy = createNetworkPolicy(
          {
            networkId: this.store.networkId(),
            mode: this.store.networkMode(),
            bridgeEnabled: true,
            directoryEnabled: this.store.directoryEnabled(),
          },
          this.requireSigner(),
        );
        this.store.saveNetworkPolicy(policy);
        return { enabled: true, publicationAuthority: false };
      }
      case "bridge.export": {
        const i = p.intent(args.intentId);
        if (!i.bridge || i.contentCid !== args.contentCid || !p.canSend(i))
          throw new Error("Approved Bridge snapshot required");
        const publication = p.get(i.contentCid, i.snapshot.networkId)!;
        const artifactData: Record<string, string> = {};
        for (const a of publication.snapshot.bundle.artifacts) {
          const bytes = p.artifactBytes(i.snapshot.networkId, a.cid);
          if (bytes)
            artifactData[a.cid] = Buffer.from(bytes).toString("base64url");
        }
        p.sent(i.contentCid);
        return { publication, artifactData };
      }
      case "bridge.import": {
        const networkId = this.store.networkId();
        const result = p.accept(args.publication, networkId);
        for (const [cid, data] of Object.entries(args.artifactData ?? {}))
          p.cacheArtifact(
            networkId,
            cid,
            Buffer.from(String(data), "base64url"),
          );
        return { accepted: result };
      }
      case "publication.prepare":
      case "bridge.prepare":
        return p.prepare(
          {
            ...args,
            workspaceId,
            bridge: method === "bridge.prepare",
          } as PreparePublicationInput,
          human ? undefined : caller.agentId,
        );
      case "publication.list":
        return p
          .intents()
          .filter(
            (i) =>
              human ||
              (i.workspaceId === workspaceId && i.agentId === caller.agentId),
          );
      case "publication.approve":
        return p.approve(args.intentId, args.contentCid, this.requireSigner());
      case "publication.cancel":
        return p.cancel(args.intentId);
      case "publication.auto": {
        if (human)
          throw new Error(
            "Automatic publication uses an agent-scoped credential",
          );
        return p.approve(
          args.intentId,
          args.contentCid,
          this.requireSigner(),
          args.grantId,
          caller.agentId,
        );
      }
      case "backup.export":
        return this.store.exportBundle();
      case "backup.restore": {
        await this.network?.disconnect();
        const r = this.store.importBundle(args.bundle);
        p.restoreOffline();
        return r;
      }
      case "research.list": {
        const all = this.store.exportBundle({
          includeArtifactData: false,
          includeMembership: false,
        });
        const approved = p.view().exportBundle({ includeArtifactData: false });
        return {
          topics: [
            ...new Map(
              [
                ...(approved.topics ?? []),
                ...(all.topics ?? []).filter(
                  (t) =>
                    human ||
                    p.workspaceOf({ kind: "topics", id: t.topicId }) ===
                      workspaceId,
                ),
              ].map((t) => [t.topicId, t]),
            ).values(),
          ],
          trails: [
            ...new Map(
              [
                ...approved.trails,
                ...all.trails.filter(
                  (t) =>
                    human ||
                    p.workspaceOf({ kind: "trails", id: t.trailId }) ===
                      workspaceId,
                ),
              ].map((t) => [t.trailId, t]),
            ).values(),
          ],
        };
      }
      case "research.catalog": {
        const all = this.store.exportBundle({
          includeArtifactData: false,
          includeMembership: false,
        });
        return recordKinds
          .flatMap((kind) =>
            (all[kind] ?? []).map((value: any) => ({
              ref: { kind, id: recordId(kind, value) },
              title:
                value.title ??
                value.question ??
                value.payload?.note ??
                value.result ??
                recordId(kind, value),
              content: value,
              workspaceId: p.workspaceOf({ kind, id: recordId(kind, value) }),
            })),
          )
          .filter((v) => v.workspaceId === workspaceId);
      }
      case "research.topic": {
        if (
          !human &&
          p.workspaceOf({ kind: "topics", id: args.topicId }) !== workspaceId
        )
          return p.view().getTopicRecord(args.topicId);
        const local = this.store.getTopicRecord(args.topicId),
          remote = p.view().getTopicRecord(args.topicId);
        if (!local || !remote) return local ?? remote;
        return {
          ...local,
          subproblems: [
            ...new Map(
              [...remote.subproblems, ...local.subproblems].map((v) => [
                v.subproblemId,
                v,
              ]),
            ).values(),
          ],
          activities: [
            ...new Map(
              [...remote.activities, ...local.activities].map((v) => [
                v.activityId,
                v,
              ]),
            ).values(),
          ],
          reviews: [
            ...new Map(
              [...remote.reviews, ...local.reviews].map((v) => [v.reviewId, v]),
            ).values(),
          ],
          trails: [
            ...new Map(
              [...remote.trails, ...local.trails].map((v) => [v.trailId, v]),
            ).values(),
          ],
        };
      }
      case "research.save": {
        if (Buffer.byteLength(JSON.stringify(args)) > 10 * 1024 * 1024)
          throw new Error("Local research request exceeds 10 MiB");
        const master = this.requireSigner();
        const signer = human ? master : caller.role === "agent" && caller.signingIdentityId ? this.vault.get(caller.signingIdentityId, master.privateKey) : undefined;
        if (!signer) throw new Error("Agent signing identity missing; create a new scoped credential");
        let records: RecordRef[] = [];
        let result: any;
        // For working on a downloaded topic, copy only its approved snapshot into the local workspace.
        if (args.topicId && !this.store.getTopic(args.topicId)) {
          for (const pub of p
            .list(this.store.networkId())
            .filter((v) => v.snapshot.topicId === args.topicId))
            this.store.importBundle(pub.snapshot.bundle);
        }
        const visibility =
          this.store.networkMode() === "federated"
            ? ("public" as const)
            : ("private" as const);
        this.store.transaction(() => {
          if (args.kind === "topic") {
            result = createResearchTopic(
              {
                question: args.question,
                context: args.context ?? "",
                visibility,
                domains: args.domains ?? [],
              },
              signer,
            );
            this.store.saveTopic(result);
            records = [{ kind: "topics", id: result.topicId }];
          } else if (args.kind === "subproblem") {
            result = createResearchSubproblem(
              {
                topicId: args.topicId,
                title: args.title,
                statement: args.statement,
                constraints: args.constraints ?? [],
              },
              signer,
            );
            this.store.saveSubproblem(result);
            records = [{ kind: "subproblems", id: result.subproblemId }];
          } else if (args.kind === "activity") {
            result = createTopicActivity(
              {
                topicId: args.topicId,
                subproblemId: args.subproblemId || undefined,
                activityType: args.activityType ?? "attempt_started",
                payload: { note: args.note },
                visibility,
              },
              signer,
            );
            this.store.saveTopicActivity(result);
            records = [{ kind: "topicActivities", id: result.activityId }];
          } else if (args.kind === "topicReview") {
            result = createSignedTopicReview(
              {
                topicId: args.topicId,
                ...(args.subproblemId
                  ? { subproblemId: args.subproblemId }
                  : {}),
                status: args.status ?? "replicated",
                method: args.method,
                result: args.result,
                createdAt: new Date().toISOString(),
              },
              signer,
            );
            this.store.saveTopicReview(result);
            records = [{ kind: "topicReviews", id: result.reviewId }];
          } else if (args.kind === "event") {
            const trail = this.store.getTrail(args.trailId);
            if (!trail) throw new Error("Unknown trail");
            if (
              !human &&
              p.workspaceOf({ kind: "trails", id: args.trailId }) !==
                workspaceId
            )
              throw new Error("Trail is outside agent workspace");
            result = createSignedEvent(
              {
                recordId: args.trailId,
                parentEventIds: args.parentEventIds ?? trail.headEventIds,
                eventType: args.eventType ?? "observation",
                payload: { note: args.note },
                artifactRefs: [],
                citationRefs: [],
                visibility: trail.visibility,
              },
              signer,
            );
            this.store.appendEvent(result);
            records = [{ kind: "events", id: result.eventId }];
          } else if (args.kind === "trail") {
            const trail = createTrailDraft(
              {
                title: args.title,
                abstract: args.note,
                visibility,
                topicId: args.topicId || undefined,
                subproblemId: args.subproblemId || undefined,
              },
              signer,
            );
            const attachments = (args.attachments ?? []).map((a: any) => {
              const data = Buffer.from(String(a.data), "base64url");
              return {
                cid: cidFromBytes(data),
                data,
                label: String(a.filename),
                mediaType: String(a.mediaType || "application/octet-stream"),
              };
            });
            const event = createSignedEvent(
              {
                recordId: trail.trailId,
                parentEventIds: [],
                eventType: args.eventType ?? "hypothesis",
                payload: {
                  note: args.note,
                  ...(["failure", "counterexample"].includes(args.eventType)
                    ? { trailStatus: "negative" }
                    : args.eventType === "open_question"
                      ? { trailStatus: "unresolved" }
                      : {}),
                },
                artifactRefs: attachments.map((a: any) => ({
                  cid: a.cid,
                  label: a.label,
                  mediaType: a.mediaType,
                  byteSize: a.data.length,
                  encryptionMode: "none" as const,
                })),
                citationRefs: [],
                visibility,
              },
              signer,
            );
            result = this.store.publish(trail, [event]);
            records = [
              { kind: "trails", id: trail.trailId },
              { kind: "events", id: event.eventId },
            ];
            for (const a of attachments) {
              this.store.saveArtifact(
                {
                  cid: a.cid,
                  checksum: a.cid,
                  byteSize: a.data.length,
                  mediaType: a.mediaType,
                  encryptionMode: "none",
                  sourceEventId: event.eventId,
                },
                a.data,
              );
              records.push({ kind: "artifacts", id: a.cid });
            }
          } else throw new Error("Unknown research record type");
          p.assign(records, workspaceId);
        });
        return { result, records, workspaceId, publication: "local-only" };
      }
      default:
        throw new Error("Unknown local operation");
    }
  }
}
