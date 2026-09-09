import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertPdfResponse, fetchOfficialDocument } from "../scripts/lib/official-document.mjs";

test("accepts PDF magic bytes and rejects an HTML challenge", () => {
  assert.doesNotThrow(() => assertPdfResponse({ contentType: "application/pdf",
    bytes: Buffer.from("%PDF-1.7\n") }));
  assert.throws(() => assertPdfResponse({ contentType: "text/html",
    bytes: Buffer.from("<!DOCTYPE html><title>Just a moment...</title>") }), /not a PDF/);
});

test("downloads only official domains and reuses a hashed local document", async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "official-doc-"));
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(Buffer.from("%PDF-1.7\nfixture"), {
      status: 200, headers: { "content-type": "application/pdf" },
    });
  };
  const options = { url: "https://example.org/list.pdf", allowedDomains: ["example.org"], cacheDir, fetchImpl };
  const first = await fetchOfficialDocument(options);
  const second = await fetchOfficialDocument(options);
  assert.equal(calls, 1);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.path, second.path);
  await assert.rejects(fetchOfficialDocument({ ...options, url: "https://not-official.test/list.pdf" }),
    /not allowed/);
});
