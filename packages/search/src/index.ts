import type { ResearchTrail } from "../../core/src/index.js";

export interface SearchQuery {
  query?: string;
  domain?: string;
  status?: string;
  visibility?: string;
}

/** Used by browser clients when a node is unavailable. The node uses the same fields in FTS5. */
export function searchLocalTrails(trails: ResearchTrail[], filters: SearchQuery): ResearchTrail[] {
  const query = filters.query?.trim().toLowerCase();
  return trails.filter((trail) => {
    const haystack = [trail.title, trail.abstract, ...trail.domains, ...trail.tags].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (!filters.domain || trail.domains.includes(filters.domain))
      && (!filters.status || trail.status === filters.status)
      && (!filters.visibility || trail.visibility === filters.visibility);
  });
}
