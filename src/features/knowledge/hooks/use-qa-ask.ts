/** 知识库模块：流式提问 Hook — 管理 SSE 连接、累积逐块文本、完成后刷新会话消息 */

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { askQuestionStream } from "../api";

/** 流式提问 Hook */
export function useQaAsk() {
  const queryClient = useQueryClient();
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback((sessionId: string, question: string) => {
    // 取消上一次未完成的流
    abortRef.current?.abort();
    setStreamingAnswer("");
    setIsStreaming(true);

    const controller = askQuestionStream(sessionId, question, {
      onDelta: (text) => {
        setStreamingAnswer((prev) => prev + text);
      },
      onMeta: () => {
        setIsStreaming(false);
        setStreamingAnswer("");
        // 流完成后从数据库刷新完整消息列表
        queryClient.invalidateQueries({
          queryKey: ["knowledge", "qa", "session", sessionId],
        });
      },
      onError: () => {
        setIsStreaming(false);
        setStreamingAnswer("");
      },
    });

    abortRef.current = controller;
  }, [queryClient]);

  return { ask, streamingAnswer, isStreaming };
}
