const ROLE_RANK = {
  backup: 70,
  archive: 60,
  generated: 50,
  reference: 40,
  source: 30,
  active_work: 20,
  application_state: 10,
  cache: 5,
  inbox: 5,
  temporary: 5,
  unknown: 0,
};

const LIFECYCLE_RANK = {
  hold: 100,
  retired: 90,
  archive: 70,
  rebuildable: 60,
  reference: 50,
  active: 30,
  working: 20,
  unknown: 0,
};

function safeRank(map, value) {
  return Number.isFinite(map[value]) ? map[value] : -1;
}

function compareRecords(a, b) {
  const lifecycleDelta = safeRank(LIFECYCLE_RANK, b.lifecycle) - safeRank(LIFECYCLE_RANK, a.lifecycle);
  if (lifecycleDelta !== 0) return lifecycleDelta;
  const roleDelta = safeRank(ROLE_RANK, b.role) - safeRank(ROLE_RANK, a.role);
  if (roleDelta !== 0) return roleDelta;
  const confidenceDelta = safeRank({ low: 1, medium: 2, high: 3 }, b.confidence) - safeRank({ low: 1, medium: 2, high: 3 }, a.confidence);
  if (confidenceDelta !== 0) return confidenceDelta;
  return String(a.item_ref).localeCompare(String(b.item_ref));
}

export function buildDuplicateClusters(records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  const includeUnknown = options.includeUnknown === true;
  const groups = new Map();
  let considered = 0;
  let skippedMissingFingerprint = 0;
  let skippedUnknownFingerprint = 0;

  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const fp = record.content_fingerprint;
    if (!fp || typeof fp.algorithm !== "string" || typeof fp.digest !== "string") {
      skippedMissingFingerprint += 1;
      continue;
    }
    if (!includeUnknown && (record.lifecycle === "hold" || record.lifecycle === "retired" || record.privacy === "secret")) {
      skippedUnknownFingerprint += 1;
      continue;
    }
    considered += 1;
    const key = fp.algorithm + ":" + fp.digest.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const clusters = [];
  for (const [digestKey, members] of groups) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(compareRecords);
    clusters.push({
      fingerprint: digestKey,
      count: members.length,
      suggestedCanonicalRef: sorted[0].item_ref ?? null,
      suggestedCanonicalReason: sorted[0].lifecycle ?? sorted[0].role ?? "deterministic_tie_break",
      members: sorted.map((record) => ({
        item_ref: record.item_ref ?? null,
        owner: record.owner ?? "unknown",
        role: record.role ?? "unknown",
        privacy: record.privacy ?? "unknown",
        lifecycle: record.lifecycle ?? "unknown",
        confidence: record.confidence ?? "low",
      })),
      actionPolicy: "REVIEW_ONLY",
      neverAutoDelete: true,
    });
  }
  clusters.sort((a, b) => b.count - a.count || a.fingerprint.localeCompare(b.fingerprint));
  return {
    summary: {
      recordsSeen: records.length,
      recordsConsidered: considered,
      skippedMissingFingerprint,
      skippedProtectedOrUnknown: skippedUnknownFingerprint,
      clusterCount: clusters.length,
    },
    clusters,
    limits: [
      "Fingerprint equality is a candidate signal, not proof of duplicate meaning or deletability.",
      "No file body is read by this analyzer; it only consumes supplied index records.",
      "No move, overwrite, deletion, or index mutation is performed.",
    ],
  };
}
