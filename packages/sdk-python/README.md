# Sidelore Python clients

`SideloreClient` provides public reads and legacy authenticated operator calls.
`SideloreResearchClient(base_url, agent_token)` uses the scoped local service.

```python
from sidelore_sdk import SideloreResearchClient
client = SideloreResearchClient("http://127.0.0.1:8787", agent_token)
saved = client.save_research(kind="activity", topicId=topic_id,
    activityType="summary", note="The proposed reduction failed because…")
intent = client.prepare_publication(network_id, topic_id, saved["records"])
# Optional: only when a human has previously created this bounded task grant.
state = client.publish_with_grant(intent["intentId"], intent["contentCid"], grant_id)
```

Check the returned status: scope, expiry, suspicious content or quotas may leave
output in the human queue. This client has no human approval, grant creation,
vault or backup management methods. Subscriptions do not start research.
