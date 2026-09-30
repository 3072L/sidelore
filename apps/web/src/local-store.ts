import { openDB, type DBSchema } from "idb";

export interface BrowserDraft {
  id: string;
  title: string;
  note: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
  visibility?: "public" | "federated" | "private";
  topicId?: string;
  subproblemId?: string;
}

interface SideloreBrowserDb extends DBSchema {
  drafts: {
    key: string;
    value: BrowserDraft;
    indexes: { "by-updated": string };
  };
  identity: {
    key: string;
    value: { id: "current"; identity: unknown; privateKey: string };
  };
}

const database = openDB<SideloreBrowserDb>("sidelore-browser", 1, {
  upgrade(db) {
    const drafts = db.createObjectStore("drafts", { keyPath: "id" });
    drafts.createIndex("by-updated", "updatedAt");
    db.createObjectStore("identity", { keyPath: "id" });
  }
});

export async function listBrowserDrafts(): Promise<BrowserDraft[]> {
  return (await database).getAllFromIndex("drafts", "by-updated").then((drafts) => drafts.reverse());
}

export async function saveBrowserDraft(draft: BrowserDraft): Promise<void> {
  await (await database).put("drafts", draft);
}

export async function deleteBrowserDraft(id: string): Promise<void> {
  await (await database).delete("drafts", id);
}

export async function saveBrowserIdentity(identity: { identity: unknown; privateKey: string }): Promise<void> {
  await (await database).put("identity", { id: "current", ...identity });
}

export async function loadBrowserIdentity(): Promise<{ identity: unknown; privateKey: string } | undefined> {
  const value = await (await database).get("identity", "current");
  return value ? { identity: value.identity, privateKey: value.privateKey } : undefined;
}

/** Call only after the local vault has verified the imported key pair. */
export async function clearMigratedBrowserIdentity(): Promise<void> { await (await database).delete("identity", "current"); }
