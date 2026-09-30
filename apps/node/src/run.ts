import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createSideloreServer } from "./server.js";

const data = resolve(process.env.SIDELORE_DATA_DIR ?? ".sidelore");
mkdirSync(data, { recursive: true });
const local = createSideloreServer({
  dbPath: resolve(data, "node.sqlite"),
  vaultPath: resolve(data, "identity-vault.json"),
  surface: "local",
});
await new Promise<void>((done) =>
  local.server.listen(
    Number(process.env.SIDELORE_LOCAL_PORT ?? 8787),
    "127.0.0.1",
    done,
  ),
);
const address = local.server.address();
writeFileSync(
  resolve(data, "local-connection.json"),
  JSON.stringify({
    baseUrl: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 8787}`,
    operatorToken: local.operatorToken,
  }),
  { mode: 0o600 },
);
const passphrase = process.env.SIDELORE_VAULT_PASSPHRASE_FILE
  ? readFileSync(
      resolve(process.env.SIDELORE_VAULT_PASSPHRASE_FILE),
      "utf8",
    ).trimEnd()
  : process.env.SIDELORE_VAULT_PASSPHRASE;
if (passphrase) {
  if (local.localService.identity().identity)
    local.localService.unlock(passphrase);
  else
    local.localService.initialize(
      process.env.SIDELORE_NAME ?? "Researcher",
      passphrase,
    );
}
if (process.env.SIDELORE_NETWORK_PROFILE) {
  const profile = JSON.parse(
    readFileSync(resolve(process.env.SIDELORE_NETWORK_PROFILE), "utf8"),
  );
  local.store.publications.saveProfile(profile);
  if (profile.kind === "public" && profile.relayServer)
    local.store.setSetting("directory_enabled", true);
  if (profile.autoConnect)
    await local.localService.network!.connect(profile.networkId);
} else {
  const networkId = local.store.getSetting<string>("auto_connect_network");
  if (networkId && passphrase)
    await local.localService.network!.connect(networkId);
}
let gateway: ReturnType<typeof createSideloreServer> | undefined;
if (process.env.SIDELORE_PUBLIC_PORT) {
  gateway = createSideloreServer({
    store: local.store,
    localService: local.localService,
    surface: "public",
  });
  await new Promise<void>((done) =>
    gateway!.server.listen(
      Number(process.env.SIDELORE_PUBLIC_PORT),
      process.env.SIDELORE_PUBLIC_HOST ?? "0.0.0.0",
      done,
    ),
  );
}
console.log(
  `Sidelore self-hosted testnet. Local connection file: ${resolve(data, "local-connection.json")}`,
);
console.log(JSON.stringify(local.localService.network?.status()));
let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  await new Promise<void>((done) =>
    gateway ? gateway.server.close(() => done()) : done(),
  );
  await local.close();
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
