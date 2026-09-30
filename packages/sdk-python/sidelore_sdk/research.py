"""Local Agent capability client; human approval and grants are absent."""
from .client import SideloreClient


class SideloreResearchClient:
    def __init__(self, base_url: str, token: str):
        self._client = SideloreClient(base_url, token)

    def _call(self, method, args=None):
        return self._client._request("/local", "POST", {"method": method, "args": args or {}})

    def save_research(self, **record):
        return self._call("research.save", record)

    def get_topic(self, topic_id):
        return self._call("research.topic", {"topicId": topic_id})

    def subscribe(self, network_id, topic_id, root_cid=None):
        return self._call("subscription.add", {"networkId": network_id, "topicId": topic_id, "rootCid": root_cid})

    def prepare_publication(self, network_id, topic_id, records):
        return self._call("publication.prepare", {"networkId": network_id, "topicId": topic_id, "records": records})

    def publish_with_grant(self, intent_id, content_cid, grant_id):
        return self._call("publication.auto", {"intentId": intent_id, "contentCid": content_cid, "grantId": grant_id})

    def publication_status(self):
        return self._call("publication.list")

    def search(self, query):
        return self._call("network.search", {"query": query})
