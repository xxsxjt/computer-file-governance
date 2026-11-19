import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaDir = new URL("../schemas/", import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

const [indexSchema, transactionSchema, taskHandoffSchema, inventorySummarySchema] = await Promise.all([
  readJson(new URL("index-record.schema.json", schemaDir)),
  readJson(new URL("transaction-manifest.schema.json", schemaDir)),
  readJson(new URL("task-handoff.schema.json", schemaDir)),
  readJson(new URL("inventory-summary.schema.json", schemaDir)),
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const indexValidator = ajv.compile(indexSchema);
const transactionValidator = ajv.compile(transactionSchema);
const taskHandoffValidator = ajv.compile(taskHandoffSchema);
const inventorySummaryValidator = ajv.compile(inventorySummarySchema);

export function validateIndexRecord(record) {
  const valid = Boolean(indexValidator(record));
  return {
    valid,
    errors: valid ? [] : structuredClone(indexValidator.errors ?? []),
  };
}

export function validateTransactionManifest(manifest) {
  const valid = Boolean(transactionValidator(manifest));
  return {
    valid,
    errors: valid ? [] : structuredClone(transactionValidator.errors ?? []),
  };
}

function handoffSemanticErrors(handoff) {
  const errors = [];
  const artifacts = Array.isArray(handoff?.artifacts) ? handoff.artifacts : [];
  const byRef = new Map();
  for (const [index, artifact] of artifacts.entries()) {
    const ref = artifact?.artifact_ref;
    if (typeof ref !== "string") continue;
    if (byRef.has(ref)) {
      errors.push({
        instancePath: "/artifacts/" + index + "/artifact_ref",
        keyword: "uniqueArtifactRef",
        message: "artifact_ref must be unique within a handoff",
        params: { ref },
      });
    } else {
      byRef.set(ref, artifact);
    }
  }

  if (handoff?.status !== "completed") return errors;

  const completion = handoff.completion;
  const deliverable = byRef.get(completion?.deliverable_ref);
  const evidence = byRef.get(completion?.evidence_ref);
  if (!deliverable || deliverable.artifact_kind !== "deliverable" || deliverable.state !== "verified") {
    errors.push({
      instancePath: "/completion/deliverable_ref",
      keyword: "completionReference",
      message: "completion.deliverable_ref must point to a verified deliverable artifact",
      params: {},
    });
  }
  if (!evidence || evidence.artifact_kind !== "evidence" || evidence.state !== "verified") {
    errors.push({
      instancePath: "/completion/evidence_ref",
      keyword: "completionReference",
      message: "completion.evidence_ref must point to verified evidence",
      params: {},
    });
  } else if (!Array.isArray(evidence.verifies) || !evidence.verifies.includes(completion?.deliverable_ref)) {
    errors.push({
      instancePath: "/completion/evidence_ref",
      keyword: "completionRelation",
      message: "completion evidence must verify the completed deliverable",
      params: {},
    });
  }

  if (["retained", "transferred"].includes(completion?.rollback_disposition)) {
    const rollback = byRef.get(completion.rollback_ref);
    if (!rollback || rollback.artifact_kind !== "rollback") {
      errors.push({
        instancePath: "/completion/rollback_ref",
        keyword: "completionReference",
        message: "completion.rollback_ref must point to rollback material",
        params: {},
      });
    }
  }
  return errors;
}

export function validateTaskHandoff(handoff) {
  const schemaValid = Boolean(taskHandoffValidator(handoff));
  const schemaErrors = schemaValid ? [] : structuredClone(taskHandoffValidator.errors ?? []);
  if (!schemaValid) return { valid: false, errors: schemaErrors };
  const semanticErrors = handoffSemanticErrors(handoff);
  return { valid: semanticErrors.length === 0, errors: semanticErrors };
}

function inventorySummarySemanticErrors(summary) {
  const errors = [];
  const roots = Array.isArray(summary?.roots) ? summary.roots : [];
  const authorizedRootIds = Array.isArray(summary?.scope?.authorizedRootIds)
    ? summary.scope.authorizedRootIds
    : [];
  const rootIds = new Map();

  const sourceKind = summary?.collector?.sourceKind;
  const authorityStatus = summary?.collector?.authorityStatus;
  const allowedAuthority = {
    host_collector: new Set(["registered_authority", "unverified_host", "conflict_hold"]),
    external_tool: new Set(["published_derivative", "unverified_external", "conflict_hold"]),
    manual_import: new Set(["published_derivative", "unverified_external", "conflict_hold"]),
  };
  if (sourceKind && authorityStatus && !allowedAuthority[sourceKind]?.has(authorityStatus)) {
    errors.push({
      instancePath: "/collector/authorityStatus",
      keyword: "authorityStatus",
      message: "collector authorityStatus is incompatible with sourceKind",
      params: { sourceKind, authorityStatus },
    });
  }

  for (const [index, root] of roots.entries()) {
    const id = root?.id;
    if (typeof id !== "string") continue;
    if (rootIds.has(id)) {
      errors.push({
        instancePath: "/roots/" + index + "/id",
        keyword: "uniqueRootId",
        message: "root ids must be unique within an inventory summary",
        params: { id },
      });
    } else {
      rootIds.set(id, index);
    }
  }

  const declaredEntryCount = summary?.manifestEntryCount;
  const includedCount = summary?.scope?.coverage?.includedCount;
  if (Number.isInteger(declaredEntryCount) && Number.isInteger(includedCount) && declaredEntryCount !== includedCount) {
    errors.push({
      instancePath: "/manifestEntryCount",
      keyword: "entryCount",
      message: "manifestEntryCount must equal scope.coverage.includedCount",
      params: { manifestEntryCount: declaredEntryCount, includedCount },
    });
  }

  for (const [index, id] of authorizedRootIds.entries()) {
    if (!rootIds.has(id)) {
      errors.push({
        instancePath: "/scope/authorizedRootIds/" + index,
        keyword: "rootReference",
        message: "scope.authorizedRootIds must refer to a declared root",
        params: { id },
      });
    }
  }
  for (const [index, root] of roots.entries()) {
    if (typeof root?.id === "string" && !authorizedRootIds.includes(root.id)) {
      errors.push({
        instancePath: "/roots/" + index + "/id",
        keyword: "authorizedRootCoverage",
        message: "every declared root must be listed in scope.authorizedRootIds",
        params: { id: root.id },
      });
    }
  }

  const skipped = Array.isArray(summary?.skipped) ? summary.skipped : [];
  const skippedTotal = skipped.reduce((total, item) => total + (Number.isInteger(item?.count) ? item.count : 0), 0);
  const declaredSkipped = summary?.scope?.coverage?.skippedCount;
  if (Number.isInteger(declaredSkipped) && skippedTotal !== declaredSkipped) {
    errors.push({
      instancePath: "/scope/coverage/skippedCount",
      keyword: "skippedCount",
      message: "scope.coverage.skippedCount must equal the sum of skipped[].count",
      params: { declared: declaredSkipped, observed: skippedTotal },
    });
  }

  const maxEntries = summary?.scope?.coverage?.maxEntries;
  if (Number.isInteger(maxEntries) && Number.isInteger(includedCount) && includedCount > maxEntries) {
    errors.push({
      instancePath: "/scope/coverage/includedCount",
      keyword: "coverageLimit",
      message: "scope.coverage.includedCount cannot exceed scope.coverage.maxEntries",
      params: { includedCount, maxEntries },
    });
  }

  const generatedAt = Date.parse(summary?.generatedAtUtc);
  const validatedAt = Date.parse(summary?.validatedAtUtc);
  const checkedAt = Date.parse(summary?.freshness?.checkedAt);
  const refreshBy = Date.parse(summary?.freshness?.refreshByUtc);
  if (Number.isFinite(generatedAt) && Number.isFinite(validatedAt) && validatedAt < generatedAt) {
    errors.push({
      instancePath: "/validatedAtUtc",
      keyword: "timeOrder",
      message: "validatedAtUtc must not precede generatedAtUtc",
      params: {},
    });
  }
  if (Number.isFinite(validatedAt) && Number.isFinite(checkedAt) && checkedAt < validatedAt) {
    errors.push({
      instancePath: "/freshness/checkedAt",
      keyword: "timeOrder",
      message: "freshness.checkedAt must not precede validatedAtUtc",
      params: {},
    });
  }
  if (Number.isFinite(checkedAt) && Number.isFinite(refreshBy) && refreshBy < checkedAt) {
    errors.push({
      instancePath: "/freshness/refreshByUtc",
      keyword: "timeOrder",
      message: "freshness.refreshByUtc must not precede freshness.checkedAt",
      params: {},
    });
  }

  const skipRefs = new Set();
  for (const [index, item] of skipped.entries()) {
    if (typeof item?.ref !== "string") continue;
    if (skipRefs.has(item.ref)) {
      errors.push({
        instancePath: "/skipped/" + index + "/ref",
        keyword: "uniqueSkipRef",
        message: "skipped refs must be unique within an inventory summary",
        params: { ref: item.ref },
      });
    }
    skipRefs.add(item.ref);
  }
  return errors;
}

export function validateInventorySummary(summary) {
  const schemaValid = Boolean(inventorySummaryValidator(summary));
  const schemaErrors = schemaValid ? [] : structuredClone(inventorySummaryValidator.errors ?? []);
  if (!schemaValid) return { valid: false, errors: schemaErrors };
  const semanticErrors = inventorySummarySemanticErrors(summary);
  return { valid: semanticErrors.length === 0, errors: semanticErrors };
}

export function mapPrivacyToHostBinary(privacy) {
  if (privacy === "public") {
    return "PUBLIC";
  }
  if (["internal", "restricted", "secret", "unknown"].includes(privacy)) {
    return "PRIVATE_RESTRICTED";
  }
  throw new RangeError(`Unsupported governance privacy value: ${String(privacy)}`);
}

const normalizeCaseIfWindows = (value, pathImpl) =>
  pathImpl === path.win32 || (pathImpl === path && process.platform === "win32")
    ? value.toLowerCase()
    : value;

export function checkPathContainment(candidatePath, authorizedRoots, pathImpl = path) {
  if (typeof candidatePath !== "string" || candidatePath.trim().length === 0) {
    return { contained: false, matchedRoot: null, resolvedCandidate: null, reason: "empty_path" };
  }
  if (/[\u0000-\u001f\u007f]/.test(candidatePath) || /(?:%2[eE]){2}/.test(candidatePath)) {
    return { contained: false, matchedRoot: null, resolvedCandidate: null, reason: "unsafe_path_encoding" };
  }
  if (!Array.isArray(authorizedRoots) || authorizedRoots.length === 0) {
    return { contained: false, matchedRoot: null, resolvedCandidate: null, reason: "no_authorized_roots" };
  }

  const resolvedCandidate = pathImpl.resolve(candidatePath);
  const normalizedCandidate = normalizeCaseIfWindows(resolvedCandidate, pathImpl);

  for (const rawRoot of authorizedRoots) {
    if (typeof rawRoot !== "string" || rawRoot.trim().length === 0) {
      continue;
    }
    const resolvedRoot = pathImpl.resolve(rawRoot);
    const normalizedRoot = normalizeCaseIfWindows(resolvedRoot, pathImpl);
    const relative = pathImpl.relative(normalizedRoot, normalizedCandidate);
    const isInside =
      relative === "" ||
      (!relative.startsWith("..") && !pathImpl.isAbsolute(relative));
    if (isInside) {
      return {
        contained: true,
        matchedRoot: resolvedRoot,
        resolvedCandidate,
        reason: null,
      };
    }
  }

  return {
    contained: false,
    matchedRoot: null,
    resolvedCandidate,
    reason: "outside_authorized_roots",
  };
}

async function hasLinkOnChain(rootPath, targetPath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];

  let current = resolvedRoot;
  for (let i = 0; i <= segments.length; i += 1) {
    if (i > 0) {
      current = path.join(current, segments[i - 1]);
    }
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        return { hasLink: true, linkPath: current };
      }
    } catch (error) {
      if (error && error.code === "ENOENT") {
        break;
      }
      throw error;
    }
  }
  return { hasLink: false, linkPath: null };
}

export async function preflightItemPaths({
  sourcePath,
  destinationPath = null,
  authorizedRoots,
  allowExistingDestination = false,
}) {
  const sourceCheck = checkPathContainment(sourcePath, authorizedRoots);
  if (!sourceCheck.contained) {
    return {
      ok: false,
      status: "rejected",
      reason: `source_${sourceCheck.reason}`,
      source: sourceCheck,
      destination: null,
    };
  }

  let sourceStat;
  try {
    sourceStat = await lstat(sourceCheck.resolvedCandidate);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        ok: false,
        status: "rejected",
        reason: "source_missing",
        source: sourceCheck,
        destination: null,
      };
    }
    throw error;
  }

  const sourceLinkCheck = await hasLinkOnChain(sourceCheck.matchedRoot, sourceCheck.resolvedCandidate);
  if (sourceStat.isSymbolicLink() || sourceLinkCheck.hasLink) {
    return {
      ok: false,
      status: "hold",
      reason: "source_is_or_traverses_link",
      linkPath: sourceLinkCheck.linkPath ?? sourceCheck.resolvedCandidate,
      source: sourceCheck,
      destination: null,
    };
  }

  if (destinationPath !== null && destinationPath !== undefined) {
    const destinationCheck = checkPathContainment(destinationPath, authorizedRoots);
    if (!destinationCheck.contained) {
      return {
        ok: false,
        status: "rejected",
        reason: `destination_${destinationCheck.reason}`,
        source: sourceCheck,
        destination: destinationCheck,
      };
    }

    const destLinkCheck = await hasLinkOnChain(destinationCheck.matchedRoot, destinationCheck.resolvedCandidate);
    if (destLinkCheck.hasLink) {
      return {
        ok: false,
        status: "hold",
        reason: "destination_traverses_link",
        linkPath: destLinkCheck.linkPath,
        source: sourceCheck,
        destination: destinationCheck,
      };
    }

    try {
      await lstat(destinationCheck.resolvedCandidate);
      if (!allowExistingDestination) {
        return {
          ok: false,
          status: "hold",
          reason: "destination_exists_conflict",
          source: sourceCheck,
          destination: destinationCheck,
        };
      }
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }

    return {
      ok: true,
      status: "ready",
      reason: null,
      sourceBytes: sourceStat.size,
      source: sourceCheck,
      destination: destinationCheck,
    };
  }

  return {
    ok: true,
    status: "ready",
    reason: null,
    sourceBytes: sourceStat.size,
    source: sourceCheck,
    destination: null,
  };
}

export async function computeFileFingerprint(filePath, algorithm = "sha256") {
  if (!["sha256", "sha512"].includes(algorithm)) {
    throw new RangeError(`Unsupported fingerprint algorithm: ${String(algorithm)}`);
  }
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("Fingerprinting requires a regular non-symlink file.");
  }
  const hash = createHash(algorithm);
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return {
    algorithm,
    digest: hash.digest("hex"),
    bytes: stat.size,
  };
}

const PUBLIC_LEAK_PATTERNS = [
  { id: "windows_drive_path", regex: /\b[A-Za-z]:[/\\][^\s"'`)]+/ },
  { id: "posix_user_home", regex: /\/(?:Users|home)\/(?!<|example|user\b)[A-Za-z0-9._-]+\// },
  { id: "unpublished_local_draft_marker", regex: new RegExp("状态：" + "本地方案草案；未发布") },
];

export function scanTextForPublicBoundaryLeaks(text) {
  const findings = [];
  const lines = String(text).split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const rule of PUBLIC_LEAK_PATTERNS) {
      const match = line.match(rule.regex);
      if (match) {
        findings.push({
          line: idx + 1,
          rule: rule.id,
          snippet: match[0],
        });
      }
    }
  }
  return findings;
}
