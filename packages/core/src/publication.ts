import { z } from "zod";
import { canonicalBytes } from "./canonical.js";
import { cidFromValue } from "./cid.js";
import {
  signBytes,
  verifyBytes,
  isValidIdentity,
  publicIdentity,
} from "./identity.js";
import { verifyBundle } from "./bundle.js";
import { publicationSchema } from "./model-schema.js";
import type { Bundle, Identity, IdentityKeyPair } from "./types.js";

export const recordKinds = [
  "topics",
  "subproblems",
  "trails",
  "events",
  "topicActivities",
  "topicReviews",
  "reviews",
  "forks",
  "tombstones",
  "artifacts",
] as const;
export type RecordKind = (typeof recordKinds)[number];
export interface RecordRef {
  kind: RecordKind;
  id: string;
}
export const refSchema = z
  .object({ kind: z.enum(recordKinds), id: z.string().min(1).max(512) })
  .strict();
export const recordId = (kind: RecordKind, record: any): string =>
  record[
    (
      {
        topics: "topicId",
        subproblems: "subproblemId",
        trails: "trailId",
        events: "eventId",
        topicActivities: "activityId",
        topicReviews: "reviewId",
        reviews: "reviewId",
        forks: "forkId",
        tombstones: "tombstoneId",
        artifacts: "cid",
      } as const
    )[kind]
  ];

export interface NetworkProfile {
  networkId: string;
  name: string;
  kind: "local" | "organization" | "public";
  bootstrap: string[];
  indexes: string[];
  listen: string[];
  relayServer: boolean;
  autoConnect: boolean;
  cacheBytes: number;
  memberPeerIds: string[];
}
export const networkProfileSchema = z
  .object({
    networkId: z.string().regex(/^[a-zA-Z0-9._-]{1,128}$/),
    name: z.string().min(1).max(200),
    kind: z.enum(["local", "organization", "public"]),
    bootstrap: z.array(z.string().min(1)).max(32).default([]),
    indexes: z.array(z.string().url()).max(16).default([]),
    listen: z.array(z.string().min(1)).max(16).default(["/ip4/0.0.0.0/tcp/0"]),
    relayServer: z.boolean().default(false),
    autoConnect: z.boolean().default(false),
    cacheBytes: z
      .number()
      .int()
      .min(1024)
      .max(1024 ** 4)
      .default(1024 ** 3),
    memberPeerIds: z.array(z.string()).max(10000).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.kind === "local" &&
      (v.bootstrap.length || v.indexes.length || v.autoConnect || v.relayServer)
    )
      ctx.addIssue({
        code: "custom",
        message: "Local research cannot connect to infrastructure",
      });
    if (v.kind === "organization" && v.indexes.length)
      ctx.addIssue({
        code: "custom",
        message: "Organization networks do not use public indexes",
      });
  });
export interface TopicSubscription {
  networkId: string;
  topicId: string;
  rootCid?: string;
  subscribedAt: string;
  cursors: Record<string, number>;
  lastSyncAt?: string;
  lastError?: string;
}
export interface ResearchWorkspace {
  workspaceId: string;
  name: string;
  classification: "private" | "public-research";
  createdAt: string;
}
export interface PublicationSnapshot {
  protocol: "sidelore.publication/2";
  networkId: string;
  topicId: string;
  bundle: Bundle;
}
export interface PublicationEnvelope {
  protocol: "sidelore.publication/2";
  networkId: string;
  contentCid: string;
  publisherIdentityId: string;
  approvedAt: string;
  authorization: "human" | "grant";
  signature: string;
}
export interface PublishedSnapshot {
  snapshot: PublicationSnapshot;
  envelope: PublicationEnvelope;
  publisher: Identity;
}
export interface PublicationIntent {
  intentId: string;
  workspaceId: string;
  agentId?: string;
  bridge: boolean;
  contentCid: string;
  snapshot: PublicationSnapshot;
  createdAt: string;
  status: "pending" | "approved" | "cancelled" | "withdrawal-requested";
  preview: {
    records: RecordRef[];
    dependencies: RecordRef[];
    attachments: Array<{ cid: string; filenames: string[]; byteSize: number }>;
    totalBytes: number;
    warnings: string[];
  };
  grantId?: string;
  propagatedAt?: string;
  receivedBy: string[];
  attempts: number;
  nextRetryAt?: string;
  lastError?: string;
}
export interface AgentPublishGrant {
  grantId: string;
  agentId: string;
  workspaceId: string;
  topicId: string;
  networkId: string;
  contentTypes: RecordKind[];
  expiresAt: string;
  maxCount: number;
  maxBytes: number;
  allowAttachments: boolean;
  usedCount: number;
  usedBytes: number;
  revokedAt?: string;
  createdAt: string;
}
export const grantInputSchema = z
  .object({
    agentId: z.string().min(1),
    workspaceId: z.string().min(1),
    topicId: z.string().min(1),
    networkId: z.string().min(1),
    contentTypes: z.array(z.enum(recordKinds)).min(1),
    expiresAt: z.string().datetime({ offset: true }),
    maxCount: z.number().int().positive().max(100000),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(1024 ** 3),
    allowAttachments: z.boolean().default(false),
  })
  .strict();
export const prepareInputSchema = z
  .object({
    workspaceId: z.string().min(1),
    networkId: z.string().min(1),
    topicId: z.string().min(1),
    records: z.array(refSchema).min(1).max(10000),
    bridge: z.boolean().default(false),
  })
  .strict();
export type PreparePublicationInput = z.input<typeof prepareInputSchema>;

export function signPublication(
  snapshot: PublicationSnapshot,
  publisher: IdentityKeyPair,
  authorization: "human" | "grant",
  now = new Date().toISOString(),
): PublishedSnapshot {
  const body = {
    protocol: "sidelore.publication/2" as const,
    networkId: snapshot.networkId,
    contentCid: cidFromValue(snapshot),
    publisherIdentityId: publisher.identity.identityId,
    approvedAt: now,
    authorization,
  };
  return {
    snapshot,
    publisher: publicIdentity(publisher.identity),
    envelope: {
      ...body,
      signature: signBytes(canonicalBytes(body), publisher.privateKey),
    },
  };
}

export function verifyPublication(
  value: PublishedSnapshot,
  networkId: string,
): boolean {
  try {
    if (!publicationSchema.safeParse(value).success) return false;
    const { signature, ...body } = value.envelope;
    const s = value.snapshot;
    return (
      body.protocol === "sidelore.publication/2" &&
      s.protocol === body.protocol &&
      body.networkId === networkId &&
      s.networkId === networkId &&
      typeof s.topicId === "string" &&
      s.topicId.length > 0 &&
      Number.isFinite(Date.parse(body.approvedAt)) &&
      ["human", "grant"].includes(body.authorization) &&
      isValidIdentity(value.publisher) &&
      body.publisherIdentityId === value.publisher.identityId &&
      body.contentCid === cidFromValue(s) &&
      verifyBytes(
        canonicalBytes(body),
        signature,
        value.publisher.primaryPublicKey,
      ) &&
      !s.bundle.publications &&
      !s.bundle.drafts?.length &&
      !s.bundle.membershipChanges?.length &&
      !s.bundle.networkPolicy &&
      !Object.keys(s.bundle.artifactData ?? {}).length &&
      verifyBundle(s.bundle).valid
    );
  } catch {
    return false;
  }
}

export { topicShareLink, parseTopicShareLink } from "./share-link.js";
