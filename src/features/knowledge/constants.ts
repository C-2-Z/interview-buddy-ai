/** 知识库模块：常量配置 */

/** 支持的上传文件格式 */
export const SUPPORTED_FILE_TYPES = ["pdf", "docx", "txt", "md"] as const;

/** 文件大小限制（10MB） */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 文件大小限制的友好提示 */
export const MAX_FILE_SIZE_LABEL = "10MB";

/** Tab 配置 */
export const KNOWLEDGE_TABS = [
  { key: "documents" as const, label: "文档管理" },
  { key: "qa" as const, label: "知识问答" },
  { key: "graph" as const, label: "知识图谱" },
] as const;

/** 空状态提示文案 */
export const EMPTY_STATE_MESSAGES = {
  documents: {
    title: "知识库还是空的",
    description: "上传文档或粘贴文本，AI 将自动解析、分块并建立知识网络",
  },
  qa: {
    title: "还没有问答记录",
    description: "选择知识库文档，开始提问",
  },
} as const;
