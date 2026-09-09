import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFellowCounts, buildFellowIndexes, buildRetirementMetadataMetrics, mergeFellowRecords,
  replaceCompleteDirectorySlice, replaceObservedSourceSlice, validateFellowRecord,
  withRetirementMetadata } from "./lib/fellow-cache.mjs";
import { refreshRoyalSociety } from "./lib/fellow-sources/royal-society.mjs";
import { refreshAcs } from "./lib/fellow-sources/acs.mjs";
import { refreshIwa } from "./lib/fellow-sources/iwa.mjs";
import { refreshAsce } from "./lib/fellow-sources/asce.mjs";
import { refreshAiche } from "./lib/fellow-sources/aiche.mjs";
import { refreshIeee } from "./lib/fellow-sources/ieee.mjs";
import { refreshAaas } from "./lib/fellow-sources/aaas.mjs";
import { refreshRsc } from "./lib/fellow-sources/rsc.mjs";
import { refreshAtse, refreshCanadianAcademyEngineering, refreshNae, refreshRaeng } from "./lib/fellow-sources/engineering-academies.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.join(root, "data");
const registryPath = path.join(dataDir, "fellow-source-registry.json");
const stablePath = path.join(dataDir, "international-fellows-cache.json");
const today = new Date().toISOString().slice(0, 10);
const snapshotPath = path.join(dataDir, `international-fellows-cache-${today}.json`);
const args = process.argv.slice(2);
const valuesFor = (flag) => args.flatMap((value, index) => value === flag ? [args[index + 1]] : []).filter(Boolean);
const sourceIds = valuesFor("--source");
const fixturePath = valuesFor("--fixture")[0];
const dryRun = args.includes("--dry-run");
const reindexOnly = args.includes("--reindex-only");
const validatePath = valuesFor("--validate")[0];
const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(dataDir, "fellow-official-record-manifest.json"), "utf8")
  .catch(() => '{"records":[]}'));

const validateCache = (cache) => {
  const errors = [];
  if (!Array.isArray(cache.records)) errors.push("records:not-array");
  if (cache.counts?.total !== cache.records?.length) errors.push("counts:total-mismatch");
  const index = buildFellowIndexes(cache.records || []);
  if (JSON.stringify(index) !== JSON.stringify(cache.byName || {})) errors.push("byName:mismatch");
  const counts = buildFellowCounts(cache.records || []);
  if (JSON.stringify(counts) !== JSON.stringify(cache.counts || {})) errors.push("counts:mismatch");
  return errors;
};

if (validatePath) {
  const cache = JSON.parse(await fs.readFile(path.resolve(validatePath), "utf8"));
  const errors = validateCache(cache);
  console.log(JSON.stringify({ valid: errors.length === 0, errors, counts: cache.counts }, null, 2));
  process.exitCode = errors.length ? 1 : 0;
} else {
  const previous = JSON.parse(await fs.readFile(stablePath, "utf8").catch(() => "{\"records\":[],\"sources\":{}}"));
  let records = (previous.records || []).map((record) => withRetirementMetadata({ ...record,
    organizationId: record.organizationId || (record.organization === "Royal Society" ? "royal-society" : record.organization),
    listedAffiliations: record.listedAffiliations || [], sourceMode: record.sourceMode || "official-directory",
    coverage: record.coverage || "official-current-directory" }));
  const selected = reindexOnly ? [] : registry.sources.filter((source) => source.enabled
    && (!sourceIds.length || sourceIds.includes(source.organizationId)));
  const sourceStatus = { ...(previous.sources || {}) };
  const adapters = { "royal-society": refreshRoyalSociety, acs: refreshAcs, iwa: refreshIwa, asce: refreshAsce,
    aiche: refreshAiche, ieee: refreshIeee, aaas: refreshAaas, atse: refreshAtse,
    "cae-canada": refreshCanadianAcademyEngineering, raeng: refreshRaeng, "us-nae": refreshNae };
  adapters.rsc = refreshRsc;
  const fixtureText = fixturePath ? await fs.readFile(path.resolve(fixturePath), "utf8") : undefined;
  for (const source of selected) {
    const priorCount = records.filter((record) => record.organizationId === source.organizationId).length;
    const attempted = new Date().toISOString();
    try {
      const adapter = adapters[source.adapter];
      if (!adapter) throw new Error(`Adapter not implemented: ${source.adapter}`);
      const sourceManifest = JSON.parse(await fs.readFile(path.join(dataDir, "fellow-source-manifests",
        `${source.organizationId}.json`), "utf8").catch(() => "null"));
      const fetched = (await adapter({ verifiedOn: today, fixtureText, manifestRecords: manifest.records || [], sourceManifest }))
        .map(withRetirementMetadata);
      const validationErrors = fetched.flatMap((record) => validateFellowRecord(record, source)
        .map((error) => `${record.id}:${error}`));
      if (validationErrors.length) throw new Error(`Record validation failed: ${validationErrors.slice(0, 5).join(", ")}`);
      const effectiveMinimum = fixturePath ? 1 : source.minimumSafeRowCount;
      if (fetched.length < effectiveMinimum) throw new Error(`Unsafe row count ${fetched.length} < ${effectiveMinimum}`);
      const baseRecords = source.coverageKind === "official-directory-complete"
        ? replaceCompleteDirectorySlice(records, source.organizationId)
        : replaceObservedSourceSlice(records, fetched);
      records = mergeFellowRecords(baseRecords, fetched, source.organizationId);
      sourceStatus[source.organizationId] = { organization: source.organization, coverage: source.coverage,
        sourceUrls: source.sourceUrls, lastAttemptOn: attempted, lastSuccessOn: attempted, status: "success",
        priorCount, fetchedCount: fetched.length,
        recordCount: records.filter((record) => record.organizationId === source.organizationId).length };
    } catch (error) {
      sourceStatus[source.organizationId] = { ...(sourceStatus[source.organizationId] || {}),
        organization: source.organization, coverage: source.coverage, sourceUrls: source.sourceUrls,
        lastAttemptOn: attempted, status: error.blocked ? "blocked-retained" : "failed-retained",
        priorCount, recordCount: priorCount, error: error.message };
    }
  }
  const output = { schemaVersion: 2, verifiedOn: today,
    scope: "官方国际 Fellow 名单混合缓存；未命中不代表不是 Fellow", sources: sourceStatus,
    organizations: Object.fromEntries(registry.sources.map((source) => [source.organizationId, {
      organization: source.organization, coverage: source.coverage, sourceUrls: source.sourceUrls,
      acceptedGrades: source.acceptedGrades }])), counts: buildFellowCounts(records),
    retirementMetadata: buildRetirementMetadataMetrics(records),
    matchingPolicy: "姓名命中只是候选；仅机构一致或有官方履历支持的机构变更可写入 Honor",
    records, byName: buildFellowIndexes(records) };
  const errors = validateCache(output);
  if (errors.length) throw new Error(`Cache validation failed: ${errors.join(", ")}`);
  if (!dryRun) {
    const content = `${JSON.stringify(output, null, 2)}\n`;
    const temp = `${stablePath}.tmp-${process.pid}`;
    await fs.writeFile(temp, content);
    await fs.rename(temp, stablePath);
    await fs.writeFile(snapshotPath, content);
    const updatedRegistry = { ...registry, updatedOn: today, sources: registry.sources.map((source) => {
      const status = sourceStatus[source.organizationId] || {};
      return { ...source, lastAttemptOn: status.lastAttemptOn || source.lastAttemptOn || null,
        lastSuccessOn: status.lastSuccessOn || source.lastSuccessOn || null,
        lastStatus: status.status || source.lastStatus || "not-attempted",
        lastRecordCount: status.recordCount ?? source.lastRecordCount ?? 0,
        lastError: status.error || null };
    }) };
    await fs.writeFile(registryPath, `${JSON.stringify(updatedRegistry, null, 2)}\n`);
  }
  console.log(JSON.stringify({ dryRun, reindexOnly, stablePath, snapshotPath, counts: output.counts,
    retirementMetadata: output.retirementMetadata, sources: sourceStatus }, null, 2));
}
