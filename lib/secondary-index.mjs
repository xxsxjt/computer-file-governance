import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

export const QUERY_SEMANTICS = "normalized_path_substring_v1";
export const PATH_NGRAM_SIZE = 3;

export function normalizePathForQuery(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replaceAll("\\", "/")
    .toLowerCase();
}

function pathNgrams(value, size = PATH_NGRAM_SIZE) {
  if (value.length < size) return [];
  const grams = [];
  for (let index = 0; index <= value.length - size; index += 1) {
    grams.push(value.slice(index, index + size));
  }
  return [...new Set(grams)];
}

function rowPathValues(row) {
  const current = typeof row?.relativePath === "string" ? row.relativePath : null;
  const old = [row?.oldRelativePath, row?.previousRelativePath, row?.oldPath]
    .find((value) => typeof value === "string" && value.length > 0) ?? null;
  return [...new Set([current, old].filter(Boolean))];
}

function rowIsIndexable(row) {
  return ["entry", "tombstone", "hold"].includes(row?.recordType) && rowPathValues(row).length > 0;
}

function rowState(row) {
  if (row?.tombstone === true || row?.recordType === "tombstone") return "tombstone";
  if (row?.state != null) return row.state;
  if (row?.lifecycle != null) return row.lifecycle;
  return null;
}

function rowIsHold(row) {
  return row?.hold === true || row?.recordType === "hold" || row?.state === "hold" || row?.lifecycle === "hold";
}

function rowIsTombstone(row) {
  return row?.tombstone === true || row?.recordType === "tombstone" || row?.state === "tombstone";
}

function rowDigest(row) {
  return createHash("sha256")
    .update(JSON.stringify(row))
    .digest("hex");
}

function sourceFormatFor(manifestPath, summary) {
  if (summary?.manifestFormat === "gzip_jsonl") return "gzip_jsonl";
  if (summary?.manifestFormat === "jsonl") return "jsonl";
  return /\.gz$/i.test(manifestPath) ? "gzip_jsonl" : "jsonl";
}

function openManifestInput(manifestPath, manifestFormat = null) {
  const input = createReadStream(manifestPath);
  return manifestFormat === "gzip_jsonl" ? input.pipe(createGunzip()) : input;
}

async function hashRawFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

export function assessIndexFreshness(index, summary, now = new Date()) {
  const reasons = [];
  if (!index || index.schemaVersion !== 1 || index.kind !== "cfg-secondary-index") {
    return { status: "stale", reasons: ["unrecognized_index_shape"] };
  }
  if (index.querySemantics !== QUERY_SEMANTICS) reasons.push("query_semantics_mismatch");
  if (!summary || typeof summary.manifestPath !== "string") {
    return { status: "stale", reasons: ["summary_unavailable"] };
  }
  if (summary.querySemantics && summary.querySemantics !== QUERY_SEMANTICS) reasons.push("summary_query_semantics_mismatch");
  if (index.sourceManifestPath !== summary.manifestPath) reasons.push("manifest_path_mismatch");
  if (summary.manifestFormat && index.sourceFormat && index.sourceFormat !== summary.manifestFormat) reasons.push("format_mismatch");
  if (Number.isInteger(summary.manifestBytes) && index.sourceBytes !== summary.manifestBytes) reasons.push("bytes_mismatch");
  if (typeof summary.manifestSha256 === "string" && index.sourceSha256 !== summary.manifestSha256) reasons.push("digest_mismatch");

  const summaryFreshness = summary.freshness?.status;
  if (summaryFreshness && !["current", "due_soon"].includes(summaryFreshness)) reasons.push("summary_not_current");

  const summaryGeneratedAt = Date.parse(summary.generatedAtUtc);
  const sourceGeneratedAt = Date.parse(index.sourceGeneratedAtUtc);
  if (index.sourceGeneratedAtUtc != null && !Number.isFinite(sourceGeneratedAt)) reasons.push("invalid_source_timestamp");
  if (Number.isFinite(summaryGeneratedAt) && Number.isFinite(sourceGeneratedAt) && sourceGeneratedAt > summaryGeneratedAt + 1000) {
    reasons.push("future_source_timestamp");
  }
  const maxAgeMs = Number.isFinite(index.maxAgeMs) ? index.maxAgeMs : Number.POSITIVE_INFINITY;
  const builtAt = Date.parse(index.builtAtUtc);
  if (!Number.isFinite(builtAt)) reasons.push("invalid_index_timestamp");
  else if (now.getTime() - builtAt > maxAgeMs) reasons.push("index_too_old");
  return { status: reasons.length === 0 ? "fresh" : "stale", reasons };
}

export async function buildSecondaryIndex({ manifestPath, summary, maxAgeMs = 7 * 24 * 60 * 60 * 1000, now = new Date() }) {
  const rawDigestPromise = summary?.manifestSha256 ? null : hashRawFile(manifestPath);
  const postings = new Map();
  const documents = [];
  let entryCount = 0;
  let scanned = 0;
  const manifestFormat = sourceFormatFor(manifestPath, summary);
  const input = openManifestInput(manifestPath, manifestFormat);
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    scanned += 1;
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!rowIsIndexable(row)) continue;
    entryCount += 1;

    const pathValues = rowPathValues(row);
    const normalizedPaths = [...new Set(pathValues.map(normalizePathForQuery))];
    const digest = rowDigest(row);
    const document = {
      digest,
      recordType: row.recordType,
      rootId: row.rootId ?? null,
      relativePath: row.relativePath ?? null,
      oldRelativePath: row.oldRelativePath ?? row.previousRelativePath ?? row.oldPath ?? null,
      kind: row.kind ?? null,
      bytes: row.bytes ?? null,
      mtimeUtc: row.mtimeUtc ?? null,
      state: rowState(row),
      lifecycle: row.lifecycle ?? null,
      hold: rowIsHold(row),
      tombstone: rowIsTombstone(row),
      reason: row.reason ?? row.holdReason ?? row.tombstoneReason ?? null,
      replacementRef: row.replacementRef ?? row.replacedBy ?? null,
      normalizedPaths,
    };
    documents.push(document);

    const grams = new Set(normalizedPaths.flatMap((value) => pathNgrams(value)));
    for (const gram of grams) {
      if (!postings.has(gram)) postings.set(gram, []);
      postings.get(gram).push(digest);
    }
  }
  const postingObject = {};
  for (const [gram, digests] of [...postings.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    postingObject[gram] = [...new Set(digests)].sort();
  }
  const computedSha256 = summary?.manifestSha256 ?? await rawDigestPromise;
  return {
    schemaVersion: 1,
    kind: "cfg-secondary-index",
    querySemantics: QUERY_SEMANTICS,
    pathNgramSize: PATH_NGRAM_SIZE,
    builtAtUtc: now.toISOString(),
    maxAgeMs,
    sourceManifestPath: summary?.manifestPath ?? manifestPath,
    sourceFormat: summary?.manifestFormat ?? manifestFormat,
    sourceBytes: summary?.manifestBytes ?? null,
    sourceSha256: summary?.manifestSha256 ?? computedSha256,
    sourceGeneratedAtUtc: summary?.generatedAtUtc ?? now.toISOString(),
    sourceValidatedAtUtc: summary?.validatedAtUtc ?? null,
    sourceFreshnessStatus: summary?.freshness?.status ?? null,
    entryCount,
    scannedLines: scanned,
    postings: postingObject,
    documents,
  };
}

export function loadSecondaryIndex(jsonText) {
  return JSON.parse(jsonText);
}

function exactPathMatch(document, normalizedQuery) {
  const normalizedPaths = Array.isArray(document?.normalizedPaths)
    ? document.normalizedPaths
    : rowPathValues(document).map(normalizePathForQuery);
  return normalizedPaths.some((value) => value.includes(normalizedQuery));
}

function matchPathKind(document, normalizedQuery) {
  const current = typeof document?.relativePath === "string" ? normalizePathForQuery(document.relativePath) : null;
  const old = typeof document?.oldRelativePath === "string" ? normalizePathForQuery(document.oldRelativePath) : null;
  if (current?.includes(normalizedQuery)) return "current_path";
  if (old?.includes(normalizedQuery)) return "old_path";
  return null;
}

function explainHit(document, matchPath) {
  const reasons = [];
  if (document.tombstone) reasons.push("tombstone");
  if (document.hold) reasons.push("hold");
  if (matchPath === "old_path") reasons.push("old_path");
  return {
    matchPath,
    explanation: reasons.length > 0 ? reasons.join(",") : "current_entry",
  };
}

export function querySecondaryIndex(index, query, { root = null, kind = null, limit = 40 } = {}) {
  const normalizedQuery = normalizePathForQuery(query);
  if (normalizedQuery.length === 0) return { hits: [], stale: false, reason: "empty_query" };

  let candidateDigests = null;
  const ngramSize = index?.pathNgramSize ?? PATH_NGRAM_SIZE;
  if (index?.querySemantics === QUERY_SEMANTICS && ngramSize === PATH_NGRAM_SIZE && normalizedQuery.length >= ngramSize) {
    const grams = pathNgrams(normalizedQuery, ngramSize);
    const postingLists = grams.map((gram) => index.postings?.[gram] ?? []);
    if (postingLists.some((posting) => posting.length === 0)) return { hits: [], stale: false, reason: "no_postings" };
    const shortest = postingLists.slice().sort((a, b) => a.length - b.length)[0];
    const postingSets = postingLists.map((posting) => new Set(posting));
    candidateDigests = shortest.filter((digest) => postingSets.every((set) => set.has(digest)));
  }

  const wanted = candidateDigests ? new Set(candidateDigests) : null;
  const hits = (index?.documents ?? [])
    .filter((doc) => !wanted || wanted.has(doc.digest))
    .filter((doc) => !root || doc.rootId === root)
    .filter((doc) => !kind || doc.kind === kind)
    .filter((doc) => exactPathMatch(doc, normalizedQuery))
    .slice(0, limit)
    .map(({ digest, normalizedPaths, ...doc }) => ({
      ...doc,
      ...explainHit(doc, matchPathKind(doc, normalizedQuery)),
      digest,
    }));
  return { hits, stale: false, reason: hits.length === 0 ? "no_matches" : null };
}
