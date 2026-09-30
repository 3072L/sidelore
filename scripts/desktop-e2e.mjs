import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const data = mkdtempSync(join(tmpdir(), "sidelore-desktop-e2e-"));
const app = await electron.launch({
  args: process.env.SIDELORE_E2E_EXECUTABLE ? [] : ["."],
  executablePath: process.env.SIDELORE_E2E_EXECUTABLE,
  env: { ...process.env, SIDELORE_DESKTOP_DATA: data },
});
let identityId;
try {
  const page = await app.firstWindow();
  assert.equal(await app.evaluate(({ app }) => app.getPath("sessionData")), join(data, "desktop-profile"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator(".language-control select").selectOption("zh-CN");
  await expect(page.getByText("本地研究工作区", { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  if (await page.getByRole("button", { name: "解锁 / 创建" }).isVisible()) {
    await page.getByLabel("密钥库口令").fill("synthetic-e2e-passphrase");
    await page.getByRole("button", { name: "解锁 / 创建" }).click();
    await expect(page.getByText("身份已解锁")).toBeVisible();
  }
  const identity = await page.evaluate(() =>
    window.sidelore.call("identity.status"),
  );
  identityId = identity.identity.identityId;
  assert.equal(identity.privateKey, undefined);
  await page.getByRole("button", { name: "网络与订阅" }).click();
  await page.getByText("添加替代引导节点 / 组织网络", { exact: true }).click();
  await page.getByLabel("网络 ID", { exact: true }).fill("e2e-network");
  await page
    .getByLabel("名称", { exact: true })
    .fill("Synthetic local testnet");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.getByText("网络配置已保存；尚未连接")).toBeVisible();
  await page.getByRole("button", { name: "探索与研究" }).click();
  await page
    .getByLabel("研究问题", { exact: true })
    .fill("Synthetic desktop collaboration");
  await page
    .getByLabel("背景", { exact: true })
    .fill("Local UI verification only");
  await page.getByRole("button", { name: "保存到本地", exact: true }).click();
  await expect(page.locator(".topic-detail h3")).toHaveText(
    "Synthetic desktop collaboration",
  );
  const save = async () => {
    await page.getByRole("button", { name: "保存到本地", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已保存到本地");
  };
  await page.getByLabel("记录类型").selectOption("subproblem");
  await page
    .getByLabel("标题", { exact: true })
    .fill("Check the boundary assumption");
  await page.getByLabel("问题描述").fill("Find the missing boundary case");
  await save();
  await page.getByLabel("记录类型").selectOption("trail");
  await page.getByLabel("标题", { exact: true }).fill("A failed decomposition");
  await page
    .getByLabel("研究内容", { exact: true })
    .fill(
      "The hypothesis failed because a necessary boundary case was excluded.",
    );
  await page.getByLabel("证据类型").selectOption("failure");
  await save();
  await page.getByLabel("记录类型").selectOption("activity");
  await page
    .getByLabel("研究内容", { exact: true })
    .fill("Please independently investigate the omitted case.");
  await page
    .locator("select[name=activityType]")
    .selectOption("handoff_requested");
  await save();
  await page.getByLabel("记录类型").selectOption("topicReview");
  await page.getByLabel("复现方法").fill("Independent derivation");
  await page
    .getByLabel("结果与证据")
    .fill("The counterexample is reproducible.");
  await save();
  for (const checkbox of await page.locator(".record-selection input").all())
    await checkbox.check();
  await page.getByLabel("接收网络").selectOption("e2e-network");
  await page.getByRole("button", { name: "冻结内容并预览" }).click();
  await expect(page.locator(".preview")).toBeVisible();
  await expect(page.locator(".preview pre")).toContainText(
    "The hypothesis failed",
  );
  await expect(page.getByRole("button", { name: "批准此快照" })).toBeDisabled();
  const pending = await page.evaluate(() =>
    window.sidelore.call("publication.list"),
  );
  await page.locator(".language-control select").selectOption("en");
  await expect(
    page.getByRole("button", { name: "Approve this snapshot" }),
  ).toBeDisabled();
  await expect(
    page
      .locator(".snapshot-record")
      .filter({ hasText: "The hypothesis failed", has: page.getByRole("heading", { name: "Failure evidence", exact: true }) }),
  ).toBeVisible();
  const translatedPending = await page.evaluate(() =>
    window.sidelore.call("publication.list"),
  );
  assert.equal(translatedPending[0].status, "pending");
  assert.equal(translatedPending[0].contentCid, pending[0].contentCid);
  await page.locator(".language-control select").selectOption("zh-CN");
  await page.locator(".preview input[type=checkbox]").check();
  await page.getByRole("button", { name: "批准此快照" }).click();
  await expect(page.getByRole("status")).toContainText("已获准发布");
  await expect(
    page.getByText("尚未收到其他节点确认，内容仍可能只存在本机。"),
  ).toBeVisible();
  const intents = await page.evaluate(() =>
    window.sidelore.call("publication.list"),
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0].status, "approved");
  assert.equal(intents[0].receivedBy.length, 0);
  assert.equal(intents[0].snapshot.bundle.events[0].eventType, "failure");
  mkdirSync("verification", { recursive: true });
  // Language changes affect only the interface, including while reviewing a snapshot.
  const views = [
    ["en", "Research workspace", "Publication queue", "Identity & agents"],
    ["zh-TW", "研究工作臺", "發佈佇列", "身分與 Agent"],
    ["ja", "研究ワークスペース", "公開キュー", "ID とエージェント"],
    ["zh-CN", "研究工作台", "发布队列", "身份与 Agent"],
  ];
  const initialCid = intents[0].contentCid;
  for (const [locale, researchTitle, queueTitle, settingsTitle] of views) {
    await page.locator(".language-control select").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      queueTitle,
    );
    await expect(page.locator(".publication-heading h3")).toHaveText(
      "Synthetic desktop collaboration",
    );
    await page.locator(".tabs button").nth(2).click();
    await expect(page.locator(".network-overview")).toBeVisible();
    await page.locator(".tabs button").nth(3).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      settingsTitle,
    );
    await page.locator(".tabs button").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      researchTitle,
    );
    await page.locator(".tabs button").nth(1).click();
  }
  assert.equal(
    (await page.evaluate(() => window.sidelore.call("publication.list")))[0]
      .contentCid,
    initialCid,
  );
  await page.screenshot({
    path: "verification/desktop-publication.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".tabs button").first().click();
  await page.getByLabel("记录类型").selectOption("topic");
  await page
    .getByLabel("研究问题", { exact: true })
    .fill("Unsaved multilingual draft · 未保存の下書き");
  await page.locator(".language-control select").selectOption("en");
  await expect(
    page.getByLabel("Research question", { exact: true }),
  ).toHaveValue("Unsaved multilingual draft · 未保存の下書き");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "verification/desktop-research-light.png",
    fullPage: true,
    animations: "disabled",
  });
  // Narrow layouts and longer Japanese labels must not introduce horizontal scrolling.
  await page.locator(".language-control select").selectOption("ja");
  await page.setViewportSize({ width: 390, height: 844 });
  for (let tab = 0; tab < 4; tab++) {
    await page.locator(".tabs button").nth(tab).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      true,
      `Narrow layout overflows on tab ${tab}`,
    );
  }
  await page.locator(".tabs button").nth(1).click();
  await page.screenshot({
    path: "verification/desktop-mobile-ja.png",
    fullPage: true,
    animations: "disabled",
  });
  writeFileSync(
    "verification/desktop-e2e.json",
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        passed: true,
        steps: [
          "isolated renderer",
          "automatic encrypted local identity",
          "network profile",
          "topic",
          "subproblem",
          "failed attempt",
          "handoff",
          "review",
          "frozen preview",
          "explicit approval",
          "no false remote receipt",
          "four interface languages",
          "unchanged snapshot CID across language changes",
          "unsaved draft preserved across language changes",
          "light and dark themes",
          "390px Japanese layout without horizontal overflow",
        ],
        platform: process.platform,
        architecture: process.arch,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  const page = await app.firstWindow();
  console.error(await page.locator("body").innerText());
  await page.screenshot({
    path: "/tmp/sidelore-e2e-failure.png",
    fullPage: true,
    animations: "disabled",
  });
  throw error;
} finally {
  await app.close();
}
const reopened = await electron.launch({
  args: process.env.SIDELORE_E2E_EXECUTABLE ? [] : ["."],
  executablePath: process.env.SIDELORE_E2E_EXECUTABLE,
  env: { ...process.env, SIDELORE_DESKTOP_DATA: data },
});
try {
  const page = await reopened.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "研究ワークスペース",
  );
  await expect(page.locator(".language-control select")).toHaveValue("ja");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const state = await page.evaluate(async () => ({
    identity: await window.sidelore.call("identity.status"),
    intents: await window.sidelore.call("publication.list"),
  }));
  assert.equal(state.identity.identity.identityId, identityId);
  assert.equal(state.intents.length, 1);
  console.log("Desktop workflow and restart persistence passed.");
} finally {
  await reopened.close();
  rmSync(data, { recursive: true, force: true });
}
