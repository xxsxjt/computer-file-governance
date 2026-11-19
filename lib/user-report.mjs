export const ERROR_CATALOG = Object.freeze({
  CFG_E_AUTH_SCOPE: { title: "授权范围不足", meaning: "当前根、所有者或操作类型未被任务明确授权", next: "停止操作并补充明确范围；不要把路径存在当成授权" },
  CFG_E_PATH_CONTAINMENT: { title: "路径越界", meaning: "源或目标不在授权根内", next: "使用授权根内的路径重新生成计划" },
  CFG_E_LINK_OR_MOUNT: { title: "链接或挂载边界", meaning: "路径包含符号链接、junction、mount 或 reparse point", next: "保持 hold，确认边界后再决定是否单独授权" },
  CFG_E_TARGET_CONFLICT: { title: "目标已存在", meaning: "目标位置已有对象，默认禁止覆盖", next: "换目标、先经所有者确认，或保留为 hold" },
  CFG_E_STALE_INDEX: { title: "索引已过时", meaning: "清单字节数/摘要/时间不满足新鲜度规则", next: "按证据重建索引；旧结果只作参考，不当实时状态" },
  CFG_E_PARTIAL_UNKNOWN: { title: "部分结果未知", meaning: "事务中途失败，已尽力恢复但顶层结果仍保守标记为 outcome_unknown", next: "核对真实文件系统后置状态，再按 manifest 回滚或继续" },
  CFG_E_SCHEMA_ONLY: { title: "仅通过结构校验", meaning: "schema-valid 不证明授权、路径安全或执行成功", next: "查看运行时预检和真实后置状态证据" },
  CFG_E_REVIEW_ONLY: { title: "仅建议/候选", meaning: "重复簇或分类建议只供审阅，不代表可执行决定", next: "由责任人确认后再生成单独授权的计划" },
  CFG_E_CRED_INVALID_REQUEST: { title: "凭据请求无效", meaning: "请求版本、引用或业务参数不符合 vault adapter 合同", next: "修正请求形状；不要添加明文凭据、任意 URL 或认证头" },
  CFG_E_CRED_UNSUPPORTED_VERSION: { title: "凭据合同版本不支持", meaning: "宿主 adapter 不支持请求声明的合同版本", next: "选择已登记的合同版本或停止调用，不要降级为明文凭据" },
  CFG_E_CRED_REFERENCE_UNAVAILABLE: { title: "凭据引用不可用", meaning: "opaque credential reference 缺失、失效、锁定或无法解析", next: "由 vault 所有者检查引用状态；不要把密钥粘贴给 Agent" },
  CFG_E_CRED_POLICY_DENIED: { title: "凭据策略拒绝", meaning: "当前授权、服务或策略不允许此调用", next: "保留拒绝结果，补充明确授权或调整服务端策略" },
  CFG_E_CRED_TARGET_DENIED: { title: "目标不在允许范围", meaning: "目标引用不在 adapter 的服务/资源 allowlist 内", next: "使用已登记目标；不要改用任意 URL 或 endpoint" },
  CFG_E_CRED_OPERATION_DENIED: { title: "操作不在允许范围", meaning: "operation 不在凭据或 adapter allowlist 内", next: "停止调用并由责任方登记具体操作" },
  CFG_E_CRED_HOST_UNTRUSTED: { title: "主机身份未通过", meaning: "adapter 无法确认目标主机或本机运行身份", next: "保持 fail closed，由宿主管理员核验身份和网络边界" },
  CFG_E_CRED_AUTH_DENIED: { title: "服务认证拒绝", meaning: "目标服务未接受当前认证", next: "由服务或 vault 所有者检查状态；不要输出或请求凭据值" },
  CFG_E_CRED_AUTHZ_DENIED: { title: "服务授权拒绝", meaning: "凭据已到达服务但没有所需业务权限", next: "缩小或调整服务端权限后重新授权，不要扩大目标范围" },
  CFG_E_CRED_TIMEOUT: { title: "凭据操作超时", meaning: "adapter 在合同规定时间内未确认结果", next: "按幂等性和副作用状态核对；不确定时按 outcome_unknown 处理" },
  CFG_E_CRED_RATE_LIMITED: { title: "服务限流", meaning: "目标服务要求延迟或减少请求", next: "遵循 retryAfter；非幂等操作不要盲目重试" },
  CFG_E_CRED_SERVICE_UNAVAILABLE: { title: "目标服务不可用", meaning: "服务或网络暂时不可用，结果未必已产生", next: "按响应的副作用状态决定是否安全重试" },
  CFG_E_CRED_UNSAFE_RESPONSE: { title: "响应无法安全筛选", meaning: "返回值、异常或诊断可能包含秘密或未允许字段", next: "丢弃未筛选输出并保持 fail closed，不把原文传给 Agent" },
  CFG_E_CRED_AUDIT_UNAVAILABLE: { title: "凭据审计不可用", meaning: "必要审计记录无法写入或验证", next: "停止后续调用；若副作用可能已发生，按 outcome_unknown 处理" },
  CFG_E_CRED_INTERNAL: { title: "凭据适配器内部错误", meaning: "adapter 发生未分类内部失败", next: "只保留稳定错误类别，交由宿主日志和责任方调查" },
  CFG_E_CRED_OUTCOME_UNKNOWN: { title: "凭据操作结果未知", meaning: "无法确认操作是否开始、完成或产生副作用", next: "先由宿主核对真实后置状态，再决定重试、补偿或回滚" },
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
