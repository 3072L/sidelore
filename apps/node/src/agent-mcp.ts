import type { LocalCaller, LocalResearchService } from "./local-service.js";

const methods: Record<
  string,
  {
    method: string;
    description: string;
    properties: Record<string, unknown>;
    required?: string[];
  }
> = {
  list_research: {
    method: "research.list",
    description: "Read this agent's local research workspace.",
    properties: {},
  },
  get_topic: {
    method: "research.topic",
    description:
      "Read a topic in this workspace or the approved content library.",
    properties: { topicId: { type: "string" } },
    required: ["topicId"],
  },
  save_research: {
    method: "research.save",
    description:
      "Save a topic, subproblem, attempt, failure, handoff or review locally. Saving never authorizes publication.",
    properties: {
      kind: {
        enum: [
          "topic",
          "subproblem",
          "trail",
          "event",
          "activity",
          "topicReview",
        ],
      },
      title: { type: "string" },
      question: { type: "string" },
      context: { type: "string" },
      statement: { type: "string" },
      topicId: { type: "string" },
      subproblemId: { type: "string" },
      trailId: { type: "string" },
      note: { type: "string" },
      eventType: { type: "string" },
      activityType: { type: "string" },
      status: { type: "string" },
      method: { type: "string" },
      result: { type: "string" },
    },
    required: ["kind"],
  },
  prepare_publication: {
    method: "publication.prepare",
    description:
      "Freeze explicit records for preview. Unapproved dependencies stop preparation.",
    properties: {
      networkId: { type: "string" },
      topicId: { type: "string" },
      records: {
        type: "array",
        items: {
          type: "object",
          properties: { kind: { type: "string" }, id: { type: "string" } },
          required: ["kind", "id"],
        },
      },
    },
    required: ["networkId", "topicId", "records"],
  },
  publish_with_grant: {
    method: "publication.auto",
    description:
      "Use an existing task grant. Outside-scope, suspicious or expired output remains in human review.",
    properties: {
      intentId: { type: "string" },
      contentCid: { type: "string" },
      grantId: { type: "string" },
    },
    required: ["intentId", "contentCid", "grantId"],
  },
  publication_status: {
    method: "publication.list",
    description:
      "List approval, transmission and remote receipt state for this agent.",
    properties: {},
  },
  subscribe_topic: {
    method: "subscription.add",
    description:
      "Follow a topic. Does not claim participation, start research or authorize publication.",
    properties: {
      networkId: { type: "string" },
      topicId: { type: "string" },
      rootCid: { type: "string" },
    },
    required: ["networkId", "topicId"],
  },
  search_network: {
    method: "network.search",
    description:
      "Query configured indexes, preserving each source and its limited coverage.",
    properties: { query: { type: "string" } },
  },
};
export async function handleAgentMcp(
  service: LocalResearchService,
  caller: LocalCaller,
  message: any,
) {
  const base = { jsonrpc: "2.0", id: message.id ?? null };
  if (message.method === "initialize")
    return {
      ...base,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "sidelore-local", version: "0.2.0" },
      },
    };
  if (message.method === "notifications/initialized") return {};
  if (message.method === "tools/list")
    return {
      ...base,
      result: {
        tools: Object.entries(methods).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: {
            type: "object",
            properties: tool.properties,
            required: tool.required ?? [],
            additionalProperties: false,
          },
        })),
      },
    };
  if (message.method !== "tools/call")
    return { ...base, error: { code: -32601, message: "Unknown MCP method" } };
  try {
    const tool = methods[message.params?.name];
    if (!tool) throw new Error("Unknown or human-only tool");
    const structuredContent = await service.call(
      tool.method,
      message.params?.arguments,
      caller,
    );
    return {
      ...base,
      result: {
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      },
    };
  } catch (e) {
    return {
      ...base,
      result: {
        isError: true,
        content: [
          { type: "text", text: e instanceof Error ? e.message : String(e) },
        ],
      },
    };
  }
}
