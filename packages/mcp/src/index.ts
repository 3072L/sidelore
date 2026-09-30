/** The HTTP MCP endpoint is local and requires a scoped Agent credential. */
export const SIDELORE_MCP_TOOLS = ["list_research", "get_topic", "save_research", "prepare_publication", "publish_with_grant", "publication_status", "subscribe_topic", "search_network"] as const;
export type SideloreMcpTool = typeof SIDELORE_MCP_TOOLS[number];
