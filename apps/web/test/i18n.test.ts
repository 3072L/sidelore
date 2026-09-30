import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalog,
  detectLocale,
  languages,
  localizeError,
  statusLabels,
  translate,
} from "../src/i18n.js";

test("UI language follows supported system preferences and keeps regional Chinese variants", () => {
  assert.equal(detectLocale(["de-DE", "ja-JP", "en-US"]), "ja");
  assert.equal(detectLocale(["zh-Hant-HK"]), "zh-TW");
  assert.equal(detectLocale(["zh-TW"]), "zh-TW");
  assert.equal(detectLocale(["zh-Hans-SG"]), "zh-CN");
  assert.equal(detectLocale(["zh-Hans-HK"]), "zh-CN");
  assert.equal(detectLocale(["en-GB"]), "en");
  assert.equal(detectLocale(["de-DE"]), "en");
  assert.equal(detectLocale([]), "en");
});

test("every language preserves publication consent, interpolation values and status meanings", () => {
  const placeholders = (text: string) =>
    [...text.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
  for (const [key, translations] of Object.entries(catalog)) {
    assert.equal(translations.length, 3, key);
    for (const translation of translations)
      assert.deepEqual(placeholders(translation), placeholders(key), key);
  }
  for (const key of Object.values(statusLabels))
    assert.ok(catalog[key], `Missing status: ${key}`);
  for (const { code } of languages) {
    const original = "A researcher’s unchanged statement · 原文 · 原文のまま";
    assert.equal(translate(code, original), original);
    const rendered = translate(code, "Source: {source} · coverage limited to this index", {
      source: "https://index.example/$&",
    });
    assert.ok(rendered.includes("https://index.example/$&"));
    assert.equal(rendered.includes("{source}"), false);
    assert.ok(
      translate(
        code,
        "I have checked the content, attachments, filenames, references, and destination network. I approve this immutable snapshot.",
      ),
    );
  }
  assert.equal(translate("en", "{count} records", { count: 1 }), "1 record");
  assert.equal(translate("en", "{count} records", { count: 2 }), "2 records");
  assert.equal(translate("ja", "approved"), "承認済み");
  assert.equal(translate("zh-TW", "pending"), "待人工確認");
  assert.match(
    localizeError(
      "Error invoking remote method 'sidelore:call': Error: Publication snapshot changed or is no longer pending",
      (key) => translate("en", key),
    ),
    /new preview/,
  );
});
