import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaDir = new URL("../schemas/", import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

const [indexSchema, transactionSchema] = await Promise.all([
  readJson(new URL("index-record.schema.json", schemaDir)),
  readJson(new URL("transaction-manifest.schema.json", schemaDir)),
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const indexValidator = ajv.compile(indexSchema);
const transactionValidator = ajv.compile(transactionSchema);

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
