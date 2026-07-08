import type { ConversationMessage } from "./questions.repository.js";

export function parseConversation(answer: string | null): ConversationMessage[] {
  if (!answer) return [];
  try {
    const parsed = JSON.parse(answer) as ConversationMessage[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // A scored question stores the combined candidate answer as plain text.
  }
  return answer.trim() ? [{ role: "user", content: answer }] : [];
}

export function formatConversation(messages: ConversationMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "候选人" : "面试官"}: ${m.content}`)
    .join("\n\n");
}

export function combinedCandidateAnswer(messages: ConversationMessage[]): string {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n");
}

export function buildRedirectResponse(): string {
  return "作为面试官，我的职责是提问和评估，而不是回答面试题。请谈谈你对这个问题的理解和看法。";
}

export function isCopiedQuestion(content: string, question: string): boolean {
  return content.trim() === question.trim();
}

