import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalResearchService } from "../src/local-service.js";
import { LocalKeyStore, SideloreStore } from "../../../packages/storage/src/index.js";
import { canonicalBytes, verifyBytes, createIdentity } from "../../../packages/core/src/index.js";

test("identity backup uses a portable passphrase and restore verifies a receipt while remaining offline", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sidelore-recovery-"));
  const source = new SideloreStore(), destination = new SideloreStore();
  const service = new LocalResearchService(source, new LocalKeyStore(join(dir, "source.json")));
  const restored = new LocalResearchService(destination, new LocalKeyStore(join(dir, "destination.json")));
  try {
    service.initialize("Human", "os-protected-original-passphrase");
    const id = service.identity().identity!.identityId;
    const backup = await service.call("identity.backup", { passphrase: "portable-backup-passphrase" });
    assert.equal(JSON.stringify(backup).includes("privateKey"), false);
    await assert.rejects(restored.call("identity.restore", { backup, identityId: id, passphrase: "wrong-passphrase" }));
    assert.equal(restored.identity().identity, undefined);
    const result = await restored.call("identity.restore", { backup, identityId: id, passphrase: "portable-backup-passphrase" });
    assert.equal(result.verified, true); assert.equal(restored.identity().identity?.identityId, id);
    assert.equal(destination.getSetting("auto_connect_network"), null); assert.equal(destination.publications.grants().length, 0);
    const { signature, ...body } = result.receipt;
    assert.ok(verifyBytes(canonicalBytes(body), signature, restored.identity().identity!.primaryPublicKey));
    assert.equal(readFileSync(join(dir, "destination.json"), "utf8").includes("privateKey"), false);
    const mismatch = createIdentity("Mismatched private key");
    assert.throws(() => restored.migrateIdentity({ identity: service.identity().identity!, privateKey: mismatch.privateKey }, "fixture-passphrase"), /verification failed/);
    assert.equal(restored.identity().identity?.identityId, id);
  } finally { source.close(); destination.close(); rmSync(dir, { recursive: true }); }
});
