/** interview-agent：按会话保存尚未提交的文字回答草稿。 */
import { useCallback, useEffect, useState } from "react";

/**
 * 将回答草稿保存在当前浏览器，提交成功后显式清除。
 *
 * @param sessionId - Agent 会话 UUID。
 * @returns 草稿值、更新函数和清除动作。
 */
export function useAnswerDraft(sessionId: string) {
  const storageKey = `ezmock:agent-answer-draft:${sessionId}`;
  const [draft, setDraft] = useState(() =>
    typeof window === "undefined" ? "" : (localStorage.getItem(storageKey) ?? ""),
  );

  useEffect(() => {
    if (draft) localStorage.setItem(storageKey, draft);
    else localStorage.removeItem(storageKey);
  }, [draft, storageKey]);

  /** 清除已经成功提交的草稿。 */
  const clear = useCallback(() => {
    setDraft("");
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { draft, setDraft, clear };
}
