import type { ConversationMessage } from "./questions.repository.js";

// 禁飞区① 辅助：从数据库读取对话记录（JSON 字符串→消息数组），兼容旧格式
export function parseConversation(answer: string | null): ConversationMessage[] { {
  if (!answer) return [];
  try {
    const parsed = JSON.parse(answer) as ConversationMessage[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // A scored question stores the combined candidate answer as plain text.
  }
  return answer.trim() ? [{ role: "user", content: answer }] : [];
}

// 禁飞区① 辅助：消息数组→纯文本，供 AI 查看对话历史
export function formatConversation(messages: ConversationMessage[]): string { {
  return messages
    .map((m) => `${m.role === "user" ? "候选人" : "面试官"}: ${m.content}`)
    .join("\n\n");
}

// 禁飞区② 辅助：提取候选人所有回答（仅 role=user），用于评分保存
export function combinedCandidateAnswer(messages: ConversationMessage[]): string { {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n");
}

// 禁飞区① 防作弊：候选人复制题目/要求代答时的拒绝回复
export function buildRedirectResponse(): string { {
  return "作为面试官，我的职责是提问和评估，而不是回答面试题。请谈谈你对这个问题的理解和看法。";
}

// 禁飞区① 作弊检测：纯字符串全等比较，检测是否复制了题目文本
export function isCopiedQuestion(content: string, question: string): boolean { {
  return content.trim() === question.trim();
}
