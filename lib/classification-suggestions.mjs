const ROLE_RULES = [
  { role: "backup", pattern: /(^|[._-])(backup|bak|old|copy)([._-]|$)/i, weight: 3 },
  { role: "archive", pattern: /(^|[._-])(archive|archived|202[0-9])([._-]|$)/i, weight: 2 },
  { role: "reference", pattern: /(^|[._-])(readme|manual|spec|doc|docs|guide)([._-]|$)/i, weight: 3 },
  { role: "generated", pattern: /(^|[._-])(generated|build|dist|out|cache)([._-]|$)/i, weight: 3 },
  { role: "temporary", pattern: /(^|[._-])(tmp|temp|draft|scratch)([._-]|$)/i, weight: 3 },
  { role: "inbox", pattern: /(^|[._-])(downloads|inbox|incoming)([._-]|$)/i, weight: 3 },
  { role: "source", pattern: /\.(md|txt|json|ya?ml|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|sh|ps1|sql)$/i, weight: 1 },
];

const PRIVACY_RULES = [
  { privacy: "secret", pattern: /(^|[._-])(secret|token|password|passwd|credential|private[_-]?key)([._-]|$)/i, weight: 5 },
  { privacy: "restricted", pattern: /(^|[._-])(personal|private|invoice|tax|medical|hr)([._-]|$)/i, weight: 4 },
  { privacy: "internal", pattern: /(^|[._-])(internal|log|report|evidence)([._-]|$)/i, weight: 2 },
  { privacy: "public", pattern: /(^|[._-])(readme|license|public|docs?)([._-]|$)/i, weight: 1 },
];

const CONFIDENCE_ORDER = { low: 0, medium: 1, high: 2 };

function scoreRules(text, rules) {
  const scores = new Map();
  for (const rule of rules) {
    if (rule.pattern.test(text)) scores.set(rule.value ?? rule.role ?? rule.privacy, (scores.get(rule.value ?? rule.role ?? rule.privacy) ?? 0) + rule.weight);
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function confidenceFor(score, runnerUp) {
  if (score >= 4 && score > runnerUp) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export function suggestClassification(input, options = {}) {
  if (!input || typeof input !== "object") throw new TypeError("input must be an object");
  const name = String(input.name ?? input.fileName ?? input.relativePath ?? "");
  const context = Array.isArray(input.parentHints) ? input.parentHints.join(" ") : String(input.directoryContext ?? "");
  const versionControlled = input.versionControlled === true;
  const existing = input.existingRecord && typeof input.existingRecord === "object" ? input.existingRecord : null;
  const text = name + " " + context;

  const roleScores = scoreRules(text, ROLE_RULES).map(([role, weight]) => ({ role, weight }));
  const privacyScores = scoreRules(text, PRIVACY_RULES).map(([privacy, weight]) => ({ privacy, weight }));
  const role = roleScores[0]?.role ?? "unknown";
  const privacy = privacyScores[0]?.privacy ?? "unknown";
  const roleConfidence = confidenceFor(roleScores[0]?.weight ?? 0, roleScores[1]?.weight ?? 0);
  const privacyConfidence = confidenceFor(privacyScores[0]?.weight ?? 0, privacyScores[1]?.weight ?? 0);
  const overall = CONFIDENCE_ORDER[roleConfidence] <= CONFIDENCE_ORDER[privacyConfidence] ? roleConfidence : privacyConfidence;

  const reasons = [];
  if (name) reasons.push("name_tokens");
  if (context) reasons.push("directory_context");
  if (versionControlled) reasons.push("version_control_state");
  if (existing) reasons.push("existing_index_record");

  const hold = existing?.lifecycle === "hold" || privacy === "secret";
  const unknown = role === "unknown" || privacy === "unknown";
  return {
    action: "DRY_RUN_SUGGESTION_ONLY",
    appliesMutation: false,
    suggested: {
      role,
      privacy,
      lifecycle: hold ? "hold" : unknown ? "unknown" : "working",
      confidence: overall,
    },
    evidence: reasons,
    roleScores,
    privacyScores,
    preserve: {
      unknown,
      hold,
      existingLifecycle: existing?.lifecycle ?? null,
      note: "No file is moved, renamed, overwritten, or deleted by this analyzer.",
    },
    reviewerNote: options.note ?? null,
  };
}
