# Sidelore CLI

Start the shared local service with `npm run node`. Its connection information
is written with mode 0600 to `.sidelore/local-connection.json`.

```sh
npm run cli -- local network.status
npm run cli -- local identity.initialize initialize.json
npm run cli -- local research.save research.json
npm run cli -- local publication.prepare selection.json
npm run cli -- local publication.approve reviewed-cid.json
```

`reviewed-cid.json` must contain the `intentId` and exact `contentCid` returned
by preparation. This last operation requires the human operator capability.
An Agent uses `SIDELORE_AGENT_TOKEN` and a connection file containing only the
base URL, then calls `publication.auto` with an existing bounded grant.

All service methods are listed in `docs/api/openapi.yaml`. `--connection FILE`
selects another local node. The offline commands for bundle verification,
local import/export and local SQLite inspection remain available with `--db`.
Local imports and backups never imply publication consent. Keep backups private.
