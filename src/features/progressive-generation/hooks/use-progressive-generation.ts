import { useCallback, useEffect, useRef, useState } from "react";
import { getGenerationStatus, retryGeneration, subscribeGeneration } from "../api";
import type { GenerationEvent, GenerationSnapshot } from "../types";

export function useProgressiveGeneration(sessionId: string, onQuestionChange: () => Promise<void>) {
  const [snapshot, setSnapshot] = useState<GenerationSnapshot | null>(null);
  const [retrying, setRetrying] = useState(false);
  const refreshRef = useRef(onQuestionChange);
  refreshRef.current = onQuestionChange;

  const applyEvent = useCallback((event: GenerationEvent) => {
    setSnapshot(event);
    if (
      event.type === "question_ready" ||
      event.type === "ready" ||
      event.type === "report_ready"
    ) {
      void refreshRef.current();
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let poll: number | undefined;
    getGenerationStatus(sessionId)
      .then(setSnapshot)
      .catch(() => undefined);
    subscribeGeneration(sessionId, applyEvent, controller.signal).catch(() => {
      if (controller.signal.aborted) return;
      poll = window.setInterval(() => {
        getGenerationStatus(sessionId)
          .then((next) => {
            setSnapshot((current) => {
              if (
                !current ||
                next.generatedCount !== current.generatedCount ||
                next.status !== current.status
              ) {
                void refreshRef.current();
              }
              return next;
            });
          })
          .catch(() => undefined);
      }, 2_000);
    });
    return () => {
      controller.abort();
      if (poll) window.clearInterval(poll);
    };
  }, [applyEvent, sessionId]);

  async function retry() {
    setRetrying(true);
    try {
      setSnapshot(await retryGeneration(sessionId));
    } finally {
      setRetrying(false);
    }
  }

  return { snapshot, retrying, retry };
}
