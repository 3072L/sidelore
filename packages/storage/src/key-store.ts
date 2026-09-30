import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { lockSecret, unlockSecret, type IdentityKeyPair, type Identity } from "../../core/src/index.js";

interface Envelope { identity: Identity; vault: ReturnType<typeof lockSecret>; }

/** Local key vault backed by Argon2id + XChaCha20-Poly1305; private keys never enter public bundles. */
export class LocalKeyStore {
  private readonly path: string;
  private readonly entries = new Map<string, Envelope>();

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) {
      const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, Envelope>;
      for (const [id, envelope] of Object.entries(saved)) this.entries.set(id, envelope);
    }
  }

  put(keyPair: IdentityKeyPair, passphrase: string): void {
    if (passphrase.length < 10) throw new Error("Key vault passphrase must be at least ten characters");
    this.entries.set(keyPair.identity.identityId, { identity: keyPair.identity, vault: lockSecret(keyPair.privateKey, passphrase) });
    this.flush();
  }

  get(identityId: string, passphrase: string): IdentityKeyPair | undefined {
    const envelope = this.entries.get(identityId);
    if (!envelope) return undefined;
    return { identity: envelope.identity, privateKey: unlockSecret<string>(envelope.vault, passphrase) };
  }

  remove(identityId: string): void {
    this.entries.delete(identityId);
    this.flush();
  }

  exportEncrypted(): Record<string, Envelope> { return structuredClone(Object.fromEntries(this.entries)); }
  restoreEncrypted(backup: Record<string, Envelope>, identityId: string, passphrase: string): IdentityKeyPair {
    const envelope = backup?.[identityId];
    if (!envelope || envelope.identity.identityId !== identityId) throw new Error("Identity missing from encrypted backup");
    // The service verifies the key pair before inserting it into the vault.
    return { identity: envelope.identity, privateKey: unlockSecret<string>(envelope.vault, passphrase) };
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.entries), null, 2) + "\n", { mode: 0o600 });
    chmodSync(temporary, 0o600); renameSync(temporary, this.path);
  }
}
