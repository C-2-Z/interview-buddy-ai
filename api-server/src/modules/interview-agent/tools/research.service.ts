/** Interview Agent 开场前固定查询、缓存复用与搜索失败降级。 */
import type { WebSearchProvider } from "../providers/web-search.provider.js";
import type {
  AgentResearchSource,
  ResearchCategory,
} from "./preparation.types.js";

/** 开场前研究所需的冻结业务输入。 */
export type ConductResearchInput = {
  /** 是否允许本场联网研究。 */
  enabled: boolean;
  /** 岗位名称。 */
  position: string;
  /** 可选目标公司。 */
  targetCompany: string | null;
  /** 已持久化缓存来源。 */
  cachedSources: readonly AgentResearchSource[];
  /** 测试可冻结查询年份。 */
  currentYear?: number;
};

/** 研究阶段的确定性结果。 */
export type ConductResearchResult = {
  /** 成功使用来源、主动跳过或外部失败。 */
  status: "completed" | "skipped" | "failed";
  /** 缓存和新搜索合并后的去重来源。 */
  sources: AgentResearchSource[];
};

/** 固定研究查询定义。 */
type ResearchQueryPlan = {
  /** 查询类别。 */
  category: ResearchCategory;
  /** 代码模板生成的查询。 */
  query: string;
};

/**
 * 构建面试开始前的固定查询，不允许网页或模型新增查询类别。
 *
 * @param position - 冻结岗位名称。
 * @param targetCompany - 可选目标公司。
 * @param year - 查询年份。
 * @returns 最多三条 company/role/industry 查询。
 */
export function buildResearchQueries(
  position: string,
  targetCompany: string | null,
  year: number,
): ResearchQueryPlan[] {
  const queries: ResearchQueryPlan[] = [];
  if (targetCompany?.trim()) {
    queries.push({
      category: "company",
      query: `${targetCompany.trim()} ${year} 近期业务 技术方向 ${position}`,
    });
  }
  queries.push(
    {
      category: "role",
      query: `${position} ${year} 当前常见能力要求`,
    },
    {
      category: "industry",
      query: `${position} 相关领域 ${year} 近期变化`,
    },
  );
  return queries;
}

/**
 * 合并缓存和新来源并按 contentHash 去重，优先保留已持久化缓存。
 *
 * @param sources - 待合并来源。
 * @returns 按输入顺序保留的唯一来源。
 */
function deduplicateResearchSources(
  sources: readonly AgentResearchSource[],
): AgentResearchSource[] {
  const hashes = new Set<string>();
  return sources.filter((source) => {
    if (hashes.has(source.contentHash)) return false;
    hashes.add(source.contentHash);
    return true;
  });
}

/**
 * 执行开场前研究，缺 Key、超时、空结果或部分失败都不会阻止面试准备。
 *
 * @param provider - 项目内 WebSearchProvider。
 * @param input - 冻结岗位配置和缓存。
 * @param signal - Worker/请求取消信号。
 * @returns 研究状态和可用于报告附录的清洗来源。
 */
export async function conductPreInterviewResearch(
  provider: WebSearchProvider,
  input: ConductResearchInput,
  signal?: AbortSignal,
): Promise<ConductResearchResult> {
  const cached = deduplicateResearchSources(input.cachedSources);
  if (!input.enabled || !provider.available) {
    return {
      status: cached.length > 0 ? "completed" : "skipped",
      sources: cached,
    };
  }

  const cachedCategories = new Set(cached.map((source) => source.category));
  const queryPlan = buildResearchQueries(
    input.position,
    input.targetCompany,
    input.currentYear ?? new Date().getUTCFullYear(),
  ).filter((plan) => !cachedCategories.has(plan.category));
  if (queryPlan.length === 0) {
    return { status: "completed", sources: cached };
  }

  const settled = await Promise.allSettled(
    queryPlan.map(async (plan) => {
      const results = await provider.search(
        { query: plan.query, maxResults: 5 },
        signal,
      );
      return results.map((result) => ({
        ...result,
        category: plan.category,
        query: plan.query,
      }));
    }),
  );
  const newSources = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const sources = deduplicateResearchSources([...cached, ...newSources]);
  return {
    status: sources.length > 0 ? "completed" : "failed",
    sources,
  };
}
