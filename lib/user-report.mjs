export const ERROR_CATALOG = Object.freeze({
  CFG_E_AUTH_SCOPE: { title: "授权范围不足", meaning: "当前根、所有者或操作类型未被任务明确授权", next: "停止操作并补充明确范围；不要把路径存在当成授权" },
  CFG_E_PATH_CONTAINMENT: { title: "路径越界", meaning: "源或目标不在授权根内", next: "使用授权根内的路径重新生成计划" },
  CFG_E_LINK_OR_MOUNT: { title: "链接或挂载边界", meaning: "路径包含符号链接、junction、mount 或 reparse point", next: "保持 hold，确认边界后再决定是否单独授权" },
  CFG_E_TARGET_CONFLICT: { title: "目标已存在", meaning: "目标位置已有对象，默认禁止覆盖", next: "换目标、先经所有者确认，或保留为 hold" },
  CFG_E_STALE_INDEX: { title: "索引已过时", meaning: "清单字节数/摘要/时间不满足新鲜度规则", next: "按证据重建索引；旧结果只作参考，不当实时状态" },
  CFG_E_PARTIAL_UNKNOWN: { title: "部分结果未知", meaning: "事务中途失败，已尽力恢复但顶层结果仍保守标记为 outcome_unknown", next: "核对真实文件系统后置状态，再按 manifest 回滚或继续" },
  CFG_E_SCHEMA_ONLY: { title: "仅通过结构校验", meaning: "schema-valid 不证明授权、路径安全或执行成功", next: "查看运行时预检和真实后置状态证据" },
  CFG_E_REVIEW_ONLY: { title: "仅建议/候选", meaning: "重复簇或分类建议只供审阅，不代表可执行决定", next: "由责任人确认后再生成单独授权的计划" },
});

export function describeError(code) {
  const entry = ERROR_CATALOG[code];
  if (!entry) return { code, title: "未知错误", meaning: "错误码未登记", next: "保留原始错误类型并补充诊断" };
  return { code, ...entry };
}

export function summarizeResult(result, options = {}) {
  const language = options.language === "en" ? "en" : "zh";
  const status = result?.status ?? "unknown";
  const ok = result?.ok === true;
  const counts = [];
  if (Number.isFinite(result?.applied?.length)) counts.push("applied=" + result.applied.length);
  if (Number.isFinite(result?.manifest?.items?.length)) counts.push("items=" + result.manifest.items.length);
  if (Number.isFinite(result?.summary?.clusterCount)) counts.push("clusters=" + result.summary.clusterCount);
  if (Number.isFinite(result?.summary?.added)) counts.push("added=" + result.summary.added + " changed=" + result.summary.changed + " removed=" + result.summary.removed);
  const title = language === "zh" ? "治理结果摘要" : "Governance result summary";
  const headline = language === "zh"
    ? (ok ? "操作已完成并通过当前验证" : "操作未完全完成")
    : (ok ? "Operation completed with current verification" : "Operation did not complete");
  const lines = [
    title,
    headline,
    "status=" + status,
    ...(counts.length ? [counts.join(" ")] : []),
    result?.manifestPath ? "manifest=" + result.manifestPath : null,
    result?.reason ? "reason=" + result.reason : null,
    status === "outcome_unknown" ? describeError("CFG_E_PARTIAL_UNKNOWN").next : null,
  ].filter(Boolean);
  return { ok, status, lines, text: lines.join("\n") + "\n" };
}

export function humanizePathForReport(pathLike, { maxLength = 160 } = {}) {
  const value = String(pathLike ?? "");
  if (!value) return "(unavailable)";
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 3)) + "...";
}
