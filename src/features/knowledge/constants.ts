/** 知识库模块：常量配置 */

/** Tab 配置 */
export const KNOWLEDGE_TABS = [
  { key: "documents" as const, label: "文档管理" },
  { key: "qa" as const, label: "知识问答" },
  { key: "graph" as const, label: "知识图谱" },
] as const;
