import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

const hostnameAllowed = (url, allowedDomains) => {
  const hostname = new URL(url).hostname.toLowerCase();
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
};

export const assertPdfResponse = ({ contentType = "", bytes }) => {
  const header = Buffer.from(bytes || []).subarray(0, 5).toString("ascii");
  if (header !== "%PDF-" || /text\/html/i.test(contentType)) {
    throw new Error(`Official document is not a PDF (content-type=${contentType || "unknown"})`);
  }
};

export const fetchOfficialDocument = async ({ url, allowedDomains, cacheDir,
  fetchImpl = fetch, timeoutMs = 30000 }) => {
  if (!hostnameAllowed(url, allowedDomains || [])) throw new Error(`Official document domain not allowed: ${url}`);
  await fs.mkdir(cacheDir, { recursive: true });
  const documentPath = path.join(cacheDir, `${digest(url)}.pdf`);
  try {
    const bytes = await fs.readFile(documentPath);
    assertPdfResponse({ contentType: "application/pdf", bytes });
    return { url, path: documentPath, sha256: digest(bytes), contentType: "application/pdf", cached: true };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await fetchImpl(url, { redirect: "follow",
    headers: { "user-agent": "who-cite-your-works/2.0 (official membership cache)" },
    signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  assertPdfResponse({ contentType, bytes });
  const temporaryPath = `${documentPath}.tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, bytes);
  await fs.rename(temporaryPath, documentPath);
  return { url, path: documentPath, sha256: digest(bytes), contentType, cached: false };
};

export const extractPdfText = async ({ pdfPath, layout = true }) => {
  const args = [];
  if (layout) args.push("-layout");
  args.push(pdfPath, "-");
  const { stdout } = await execFileAsync("pdftotext", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
};
