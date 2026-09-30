import {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  safeStorage,
  session,
} from "electron";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createSideloreServer } from "../../node/src/server.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "sidelore-app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const here = dirname(fileURLToPath(import.meta.url));
// Explicit data directories also isolate Chromium preferences and browser storage.
// Configure this before app.ready; otherwise test/organization profiles share UI state.
if (process.env.SIDELORE_DESKTOP_DATA) {
  const profile = join(resolve(process.env.SIDELORE_DESKTOP_DATA), "desktop-profile");
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  app.setPath("userData", profile);
  app.setPath("sessionData", profile);
}
let backend: ReturnType<typeof createSideloreServer> | undefined;
const origin = "sidelore-app://client";
const methods = new Set([
  "identity.status",
  "identity.initialize",
  "identity.unlock",
  "identity.lock",
  "identity.migrate",
  "identity.backup",
  "identity.restore",
  "workspace.list",
  "workspace.create",
  "network.list",
  "network.save",
  "network.status",
  "network.search",
  "network.connect",
  "network.disconnect",
  "network.sync",
  "subscription.list",
  "subscription.add",
  "subscription.remove",
  "research.list",
  "research.topic",
  "research.save",
  "publication.prepare",
  "publication.list",
  "publication.approve",
  "publication.cancel",
  "bridge.prepare",
  "agent.create",
  "agent.revoke",
  "grant.list",
  "grant.create",
  "grant.revoke",
  "backup.export",
  "backup.restore",
]);

async function start() {
  const data = process.env.SIDELORE_DESKTOP_DATA ?? app.getPath("userData");
  mkdirSync(data, { recursive: true });
  backend = createSideloreServer({
    dbPath: join(data, "node.sqlite"),
    vaultPath: join(data, "identity-vault.json"),
    surface: "local",
  });
  const unlockPath = join(data, "os-protected-unlock");
  // OS credential protection permits automatic reconnect without putting the master key in the renderer.
  if (
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" ||
      safeStorage.getSelectedStorageBackend() !== "basic_text")
  ) {
    if (!backend.localService.identity().identity) {
      const secret = randomBytes(32).toString("base64url");
      backend.localService.initialize("Researcher", secret);
      writeFileSync(unlockPath, safeStorage.encryptString(secret), {
        mode: 0o600,
      });
    } else if (existsSync(unlockPath)) {
      try {
        backend.localService.unlock(
          safeStorage.decryptString(readFileSync(unlockPath)),
        );
      } catch {
        /* show unlock form */
      }
    }
  }
  await new Promise<void>((done) =>
    backend!.server.listen(0, "127.0.0.1", done),
  );
  const address = backend.server.address();
  // Capability available only to local tools; never injected into the renderer or public web page.
  writeFileSync(
    join(data, "local-connection.json"),
    JSON.stringify({
      baseUrl: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      operatorToken: backend.operatorToken,
    }),
    { mode: 0o600 },
  );
  const webRoot = resolve(here, "../../../web");
  protocol.handle("sidelore-app", (request) => {
    const url = new URL(request.url);
    const path = resolve(
      webRoot,
      `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`,
    );
    if (url.host !== "client" || !path.startsWith(webRoot + "/"))
      return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(path).toString());
  });
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
        ],
      },
    }),
  );
  ipcMain.handle(
    "sidelore:call",
    async (event, method: string, args: unknown) => {
      if (
        !event.senderFrame ||
        event.senderFrame !== event.sender.mainFrame ||
        !event.senderFrame.url.startsWith(origin + "/") ||
        !methods.has(method)
      )
        throw new Error("Untrusted desktop request");
      return backend!.localService.call(method, args);
    },
  );
  methods.add("research.catalog");
  methods.add("artifact.fetch");
  for (const method of ["bridge.enable", "bridge.export", "bridge.import"])
    methods.add(method);
  const window = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 850,
    minHeight: 640,
    backgroundColor: "#0b0d13",
    title: "Sidelore · Self hosted testnet",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (process.env.SIDELORE_DESKTOP_SMOKE === "1")
    window.webContents.on("console-message", (_event, level, message) =>
      console.log(`Renderer ${level}: ${message}`),
    );
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  await window.loadURL(origin + "/");
  const networkId = backend.store.getSetting<string>("auto_connect_network");
  if (
    networkId &&
    !backend.localService.identity().locked &&
    backend.store.publications.profile(networkId).autoConnect
  )
    void backend.localService.network
      ?.connect(networkId)
      .catch(() => undefined);
  if (process.env.SIDELORE_DESKTOP_SMOKE === "1") {
    await window.webContents.executeJavaScript(
      "new Promise(resolve => { let tries = 0; const t = setInterval(() => { if (document.body.innerText.includes('sidelore') || ++tries > 200) { clearInterval(t); resolve(true); } }, 25); })",
    );
    const state = await window.webContents.executeJavaScript(
      "({title:document.title, bridge:typeof window.sidelore?.call, node:typeof require, text:document.body.innerText})",
    );
    writeFileSync(join(data, "smoke-result.json"), JSON.stringify(state));
    writeFileSync(
      join(data, "smoke.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    app.quit();
  }
}
app
  .whenReady()
  .then(start)
  .catch((error) => {
    console.error(error);
    app.quit();
  });
app.on("window-all-closed", () => app.quit());
let closing = false;
app.on("before-quit", (event) => {
  if (backend && !closing) {
    event.preventDefault();
    closing = true;
    void backend.close().finally(() => app.quit());
  }
});
