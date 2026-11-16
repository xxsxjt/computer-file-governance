import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

const TOKEN_PATTERN = /[\p{L}\p{N}_.-]+/gu;

function tokenize(value) {
  return String(value ?? "")
    .toLowerCase()
    .match(TOKEN_PATTERN) ?? [];
}

function rowDigest(row) {
  return createHash("sha256")
    .update(JSON.stringify(row))
    .digest("hex");
}

export function assessIndexFreshness(index, summary, now = new Date()) {
  const reasons = [];
  if (!index || index.schemaVersion !== 1 || index.kind !== "cfg-secondary-index") {
    return { status: "stale", reasons: ["unrecognized_index_shape"] };
  }
  if (!summary || typeof summary.manifestPath !== "string") {
    return { status: "stale", reasons: ["summary_unavailable"] };
  }
  if (index.sourceManifestPath !== summary.manifestPath) reasons.push("manifest_path_mismatch");
  if (index.sourceBytes !== summary.manifestBytes) reasons.push("bytes_mismatch");
  if (index.sourceSha256 !== summary.manifestSha256) reasons.push("digest_mismatch");
  if (Number.isFinite(summary.generatedAtUtc) && Date.parse(index.sourceGeneratedAtUtc) > summary.generatedAtUtc + 1000) {
    reasons.push("future_source_timestamp");
  }
  const maxAgeMs = Number.isFinite(index.maxAgeMs) ? index.maxAgeMs : Number.POSITIVE_INFINITY;
  const builtAt = Date.parse(index.builtAtUtc);
  if (!Number.isFinite(builtAt)) reasons.push("invalid_index_timestamp");
  else if (now.getTime() - builtAt > maxAgeMs) reasons.push("index_too_old");
  return { status: reasons.length === 0 ? "fresh" : "stale", reasons };
}

export async function buildSecondaryIndex({ manifestPath, summary, maxAgeMs = 7 * 24 * 60 * 60 * 1000, now = new Date() }) {
  const hash = createHash("sha256");
  const postings = new Map();
  const documents = [];
  let entryCount = 0;
  let scanned = 0;
  const input = /\.gz$/i.test(manifestPath)
    ? createReadStream(manifestPath).pipe(createGunzip())
    : createReadStream(manifestPath);
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    scanned += 1;
    hash.update(line).update("\n");
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.recordType !== "entry") continue;
    entryCount += 1;
    const tokens = new Set([
      ...tokenize(row.relativePath),
      ...tokenize(row.rootId),
      ...tokenize(row.kind),
    ]);
    const digest = rowDigest(row);
    documents.push({
      digest,
      rootId: row.rootId,
      relativePath: row.relativePath,
      kind: row.kind,
      bytes: row.bytes ?? null,
      mtimeUtc: row.mtimeUtc ?? null,
    });
    for (const token of tokens) {
      if (!postings.has(token)) postings.set(token, []);
      postings.get(token).push(digest);
    }
  }
  const postingObject = {};
  for (const [token, digests] of [...postings.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    postingObject[token] = [...new Set(digests)].sort();
  }
  const index = {
    schemaVersion: 1,
    kind: "cfg-secondary-index",
    builtAtUtc: now.toISOString(),
    maxAgeMs,
    sourceManifestPath: summary?.manifestPath ?? manifestPath,
    sourceBytes: summary?.manifestBytes ?? null,
    sourceSha256: summary?.manifestSha256 ?? hash.digest("hex"),
    sourceGeneratedAtUtc: summary?.generatedAtUtc ?? now.toISOString(),
    entryCount,
    scannedLines: scanned,
    postings: postingObject,
    documents,
  };
  return index;
}

export function loadSecondaryIndex(jsonText) {
  return JSON.parse(jsonText);
}

export function querySecondaryIndex(index, query, { root = null, kind = null, limit = 40 } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return { hits: [], stale: true, reason: "empty_query" };
  const matched = terms
    .map((term) => index.postings?.[term] ?? [])
    .sort((a, b) => a.length - b.length)[0];
  if (!matched) return { hits: [], stale: false, reason: "no_postings" };
  const candidateDigests = matched.filter((digest) =>
    terms.every((term) => (index.postings[term] ?? []).includes(digest)));
  if (candidateDigests.length === 0) return { hits: [], stale: false, reason: "no_matches" };
  const wanted = new Set(candidateDigests);
  const hits = (index.documents ?? [])
    .filter((doc) => wanted.has(doc.digest))
    .filter((doc) => !root || doc.rootId === root)
    .filter((doc) => !kind || doc.kind === kind)
    .slice(0, limit)
    .map(({ digest, ...doc }) => ({ ...doc, digest }));
  return { hits, stale: false, reason: null };
}
