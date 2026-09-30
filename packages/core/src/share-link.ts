export function topicShareLink(
  networkId: string,
  topicId: string,
  rootCid: string,
): string {
  return `sidelore://topic/${encodeURIComponent(topicId)}?${new URLSearchParams({ network: networkId, root: rootCid })}`;
}
export function parseTopicShareLink(link: string): {
  networkId: string;
  topicId: string;
  rootCid: string;
} {
  const u = new URL(link);
  const networkId = u.searchParams.get("network"),
    rootCid = u.searchParams.get("root"),
    topicId = decodeURIComponent(u.pathname.slice(1));
  if (
    u.protocol !== "sidelore:" ||
    u.hostname !== "topic" ||
    !networkId ||
    !rootCid ||
    !topicId ||
    !/^b[a-z2-7]+$/.test(rootCid)
  )
    throw new Error("Invalid topic share link");
  return { networkId, topicId, rootCid };
}
