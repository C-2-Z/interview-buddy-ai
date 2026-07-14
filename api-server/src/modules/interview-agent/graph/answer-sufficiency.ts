/** Interview Agent 有效回答的确定性证据充分度与聚焦追问模板。 */
import type { RoleId } from "../interview-agent.types.js";

/** 有效回答仍缺少的主要证据类型。 */
export type AnswerEvidenceGap =
  | "too_brief"
  | "missing_action"
  | "missing_result"
  | "missing_specifics"
  | "vague";

/** 代码规则产生的可审计充分度结果。 */
export type AnswerSufficiency =
  | { sufficient: true; gap: null }
  | { sufficient: false; gap: AnswerEvidenceGap };

/**
 * 用长度、行动、结果和具体细节信号判断是否值得继续追问。
 *
 * 该规则只决定控制流，不生成评分；模型不能越过三次追问上限。中文和英文连接词都作为
 * 弱证据信号，后续 Phase 4 的正式证据节点仍必须引用消息原文。
 *
 * @param content - 已通过 Guard 的候选人回答。
 * @returns 是否具备进入评分的最低信息量以及首要缺口。
 */
export function assessAnswerSufficiency(content: string): AnswerSufficiency {
  const text = content.trim();
  if (text.length < 40) return { sufficient: false, gap: "too_brief" };
  const hasAction = /(?:我|we|i)\s*|(?:负责|采取|实现|设计|排查|分析|协调|推动|优化|搭建|使用|通过|首先|然后|随后)/i.test(text);
  if (!hasAction) return { sufficient: false, gap: "missing_action" };
  const hasResult = /(?:结果|最终|因此|使得|提升|降低|减少|增加|达到|改进|落地|上线|result|improv|reduc|increas|achiev)/i.test(text);
  if (!hasResult) return { sufficient: false, gap: "missing_result" };
  const hasSpecifics = /\d|%|毫秒|秒|分钟|小时|天|周|月|年|用户|请求|qps|tps|并发|成本|错误率|延迟|吞吐|团队|接口|索引|日志|指标/i.test(text);
  if (!hasSpecifics) return { sufficient: false, gap: "missing_specifics" };
  return { sufficient: true, gap: null };
}

/**
 * 根据角色和证据缺口生成一句不提供答案的聚焦追问。
 *
 * @param roleId - 当前固定面试官角色。
 * @param gap - 代码识别的主要证据缺口。
 * @returns 最多一句的中文追问。
 */
export function buildFocusedFollowUp(
  roleId: RoleId,
  gap: AnswerEvidenceGap,
): string {
  const rolePrefix = roleId === "technical"
    ? "从技术实现角度，"
    : roleId === "manager"
      ? "从决策和协作角度，"
      : roleId === "hr"
        ? "从你的个人经历角度，"
        : "请进一步说明：";
  switch (gap) {
    case "too_brief":
      return `${rolePrefix}能否补充当时的背景、你的具体行动和结果？`;
    case "missing_action":
      return `${rolePrefix}你本人具体采取了哪些步骤，为什么这样选择？`;
    case "missing_result":
      return `${rolePrefix}这些行动最终产生了什么可验证的结果，你如何确认效果？`;
    case "missing_specifics":
      return `${rolePrefix}能否用一个具体指标、约束或实例说明关键细节？`;
    case "vague":
      return `${rolePrefix}你的回答比较概括。能否用一个具体的例子，或者对比一下不同方案的差异？`;
  }
}


/* --- 新增：关键词提取、含糊检测、压力追问 --- */

const TECH_PATTERNS = [
  /[A-Z][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g,
  /\b(?:React|Vue|Angular|Spring|Flask|FastAPI|LangChain|LangGraph|Node)\b/gi,
  /\b(?:Redis|PostgreSQL|MongoDB|Kafka|Docker|Kubernetes|MySQL|Nginx)\b/gi,
  /\b(?:Transformer|Embedding|Tokenization|Attention|Fine-tuning|PyTorch|TensorFlow)\b/gi,
];

/** 从候选人回答中提取技术关键词，最多 5 个。短回答返回空数组。 */
export function extractKeywords(content: string): string[] {
  const text = content.trim();
  if (text.length < 20) return [];
  const found = new Set<string>();
  for (const pattern of TECH_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[0]);
    }
  }
  return Array.from(found).slice(0, 5);
}

const VAGUE_PATTERNS = [
  /做了[^。，]*(?:优化|改进|调整|升级)/,
  /效果[^。，]*(?:不错|还好|挺好|满意|可以)/,
  /用了[^。，]*(?:相关|相应|一些|某些)/,
  /\b(?:等等|之类的|诸如此类)\b/,
];

/** 检测候选人回答中的含糊/回避信号。 */
export function detectVagueSignal(content: string): boolean {
  const text = content.trim();
  if (text.length < 30) return true;
  return VAGUE_PATTERNS.some((pattern) => pattern.test(text));
}

/** 当 detectVagueSignal 为 true 时生成压力对比追问。 */
export function buildVagueFollowUp(roleId: RoleId, keywords: string[]): string {
  const kw = keywords[0];
  if (!kw) return "能否用一个具体的例子说明当时的情况？";
  const questions = [
    `你用了 ${kw}，当初为什么选择它而不是其他方案，你们对比过吗？`,
    `${kw} 在你们场景下具体表现如何？有没有对比过同类方案？`,
    `在使用 ${kw} 的过程中遇到过什么坑？当时是怎么解决的？`,
    `如果现在让你重新选型，你还会选 ${kw} 吗？为什么？`,
  ];
  return questions[Math.floor(Math.random() * questions.length)];
}
