import json
from urllib.request import Request, urlopen


class SideloreClient:
    def __init__(self, base_url: str, token=None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _request(self, path: str, method: str = "GET", body=None):
        payload = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"accept": "application/json", **({"content-type": "application/json"} if payload else {})}
        if self.token:
            headers["authorization"] = "Bearer " + self.token
        request = Request(
            self.base_url + path,
            data=payload,
            method=method,
            headers=headers,
        )
        with urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))

    def health(self):
        return self._request("/v1/health")

    def search_trails(self, query="", domain=None, status=None):
        from urllib.parse import urlencode

        params = {"q": query}
        if domain:
            params["domain"] = domain
        if status:
            params["status"] = status
        return self._request("/v1/search?" + urlencode({k: v for k, v in params.items() if v}))["trails"]

    def get_trail(self, trail_id):
        from urllib.parse import quote

        return self._request("/v1/trails/" + quote(trail_id, safe=""))

    def create_draft(self, title, abstract="", domains=None, tags=None):
        return self._request("/v1/drafts", "POST", {"title": title, "abstract": abstract, "domains": domains or [], "tags": tags or []})

    def list_drafts(self):
        return self._request("/v1/drafts")["drafts"]

    def append_event(self, event, identity=None):
        return self._request("/v1/events", "POST", {"event": event, **({"identity": identity} if identity else {})})

    def cite_record(self, event, identity=None):
        return self._request("/v1/citations", "POST", {"event": event, **({"identity": identity} if identity else {})})

    def submit_review(self, review):
        return self._request("/v1/reviews", "POST", review)

    def submit_fork(self, fork):
        return self._request("/v1/forks", "POST", fork)

    def submit_tombstone(self, tombstone):
        return self._request("/v1/tombstones", "POST", tombstone)

    def get_artifact(self, cid):
        from urllib.parse import quote

        return self._request("/v1/artifacts/" + quote(cid, safe=""))

    def export_bundle(self):
        return self._request("/v1/export")

    def export_backup(self):
        return self._request("/v1/backup")

    def submit_report(self, report):
        return self._request("/v1/reports", "POST", report)

    def stats(self):
        return self._request("/v1/stats")

    def list_topics(self, query="", domain=None, status=None, public_only=False):
        from urllib.parse import urlencode

        params = {"q": query}
        if domain:
            params["domain"] = domain
        if status:
            params["status"] = status
        if public_only:
            params["publicOnly"] = "true"
        return self._request("/v1/topics?" + urlencode({k: v for k, v in params.items() if v})).get("topics", [])

    def get_topic(self, topic_id, public_only=True):
        from urllib.parse import quote

        return self._request("/v1/topics/" + quote(topic_id, safe="") + "?publicOnly=" + ("true" if public_only else "false"))

    def create_topic(self, topic, identity=None):
        return self._request("/v1/topics", "POST", {"topic": topic, **({"identity": identity} if identity else {})})

    def create_subproblem(self, topic_id, subproblem, identity=None):
        from urllib.parse import quote

        return self._request("/v1/topics/" + quote(topic_id, safe="") + "/subproblems", "POST", {"subproblem": subproblem, **({"identity": identity} if identity else {})})

    def submit_topic_activity(self, topic_id, activity, identity=None):
        from urllib.parse import quote

        return self._request("/v1/topics/" + quote(topic_id, safe="") + "/activities", "POST", {"activity": activity, **({"identity": identity} if identity else {})})

    def submit_topic_review(self, review, identity=None):
        return self._request("/v1/topic-reviews", "POST", {"review": review, **({"identity": identity} if identity else {})})

    def membership_changes(self):
        return self._request("/v1/membership/changes")

    def directory_topics(self, query=None):
        from urllib.parse import quote

        return self._request("/v1/directory/topics" + (("?q=" + quote(query)) if query else ""))

    def submit_membership_change(self, change, identities=None):
        return self._request("/v1/membership/changes", "POST", {"change": change, "identities": identities or []})

    def network_policy(self):
        return self._request("/v1/network/policy")

    def save_network_policy(self, policy, identities=None):
        return self._request("/v1/network/policy", "POST", {"policy": policy, "identities": identities or []})

    def bridge_export(self, **options):
        return self._request("/v1/bridge/export", "POST", options)

    def bridge_import(self, bundle, public_only=False):
        return self._request("/v1/bridge/import", "POST", {"bundle": bundle, "publicOnly": public_only})

    def call_mcp(self, name, arguments=None):
        result = self._request("/mcp", "POST", {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments or {}}})
        return result["result"]["structuredContent"]
