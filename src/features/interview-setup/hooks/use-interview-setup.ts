/** interview-setup - 面试设置 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TYPE_PROFILES } from "@/features/interview-create/constants";
import { createConfiguredInterview, getSession, getSetupResume, listSkills } from "../api";
import type {
  Difficulty,
  InterviewSetupDraft,
  InterviewSetupMode,
  InterviewSetupSearch,
  ModelProviderName,
  SkillMeta,
} from "../types";

const DEFAULT_DRAFT: InterviewSetupDraft = {
  selectedSkillId: null,
  useCustom: false,
  position: "",
  difficulty: "中级",
  jobDescription: "",
  targetCompany: "",
  typeProfile: "default",
  resumeName: "",
  resumeText: "",
  count: 5,
  modelProvider: "deepseek",
};

/**
 * storage key
 *
 * @param mode -
 * @returns
 */
function storageKey(mode: InterviewSetupMode) {
  return `ezmock:interview-setup:${mode}`;
}

/**
 * profile for config
 *
 * @param config -
 * @returns
 */
function profileForConfig(config: unknown): string {
  if (!config || typeof config !== "object") return "default";
  const normalized = JSON.stringify(config);
  return (
    Object.entries(TYPE_PROFILES).find(([, value]) => JSON.stringify(value) === normalized)?.[0] ??
    "default"
  );
}

/**
 * use interview setup
 *
 * @param mode -
 * @param search -
 * @returns
 */
export function useInterviewSetup(mode: InterviewSetupMode, search: InterviewSetupSearch) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [draft, setDraft] = useState<InterviewSetupDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  const patchDraft = useCallback((patch: Partial<InterviewSetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(mode));
      if (saved) setDraft({ ...DEFAULT_DRAFT, ...(JSON.parse(saved) as InterviewSetupDraft) });
    } catch {
      localStorage.removeItem(storageKey(mode));
    }
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey(mode), JSON.stringify(draft));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, mode]);

  useEffect(() => {
    let cancelled = false;
    /**
     * hydrate
     * @returns Promise<
     */
    async function hydrate() {
      setHydrating(true);
      try {
        const [skillList, resumeResult, sourceResult] = await Promise.all([
          listSkills(),
          search.resumeId ? getSetupResume(search.resumeId) : Promise.resolve(null),
          search.sourceSessionId ? getSession(search.sourceSessionId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setSkills(skillList);
        if (sourceResult) {
          const source = sourceResult.session;
          patchDraft({
            selectedSkillId: source.skill_id,
            useCustom: !source.skill_id,
            position: source.position,
            difficulty: source.difficulty as Difficulty,
            jobDescription: source.job_description ?? "",
            targetCompany: source.target_company ?? "",
            typeProfile: profileForConfig(source.question_type_config),
            resumeText: source.resume_text ?? "",
            modelProvider: (source.model_provider as ModelProviderName | null) ?? "deepseek",
          });
        }
        if (resumeResult) {
          patchDraft({
            resumeId: resumeResult.id,
            resumeName: resumeResult.fileName,
            resumeText: resumeResult.parsedText.slice(0, 2000),
          });
        }
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "加载面试配置失败");
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [patchDraft, search.resumeId, search.sourceSessionId]);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === draft.selectedSkillId) ?? null,
    [draft.selectedSkillId, skills],
  );

  /**
   * 选择 skill
   *
   * @param skillId -
   * @returns
   */
  function selectSkill(skillId: string) {
    const skill = skills.find((item) => item.id === skillId);
    patchDraft({
      selectedSkillId: skillId,
      useCustom: false,
      position: skill?.name ?? draft.position,
    });
  }

  /**
   * 选择 custom
   * @returns
   */
  function selectCustom() {
    patchDraft({ selectedSkillId: null, useCustom: true, position: "" });
  }

  /**
   * go 转为 details
   * @returns
   */
  function goToDetails() {
    if (!draft.position.trim()) {
      toast.error("请选择面试方向或填写岗位名称");
      return;
    }
    setStep(2);
  }

  /**
   * 提交
   *
   * @param event -
   * @returns Promise<
   */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step === 1) {
      goToDetails();
      return;
    }
    if (!draft.position.trim()) {
      setStep(1);
      toast.error("请填写或选择面试岗位");
      return;
    }

    setLoading(true);
    try {
      const { sessionId } = await createConfiguredInterview(mode, {
        position: draft.position.trim(),
        difficulty: draft.difficulty,
        jobDescription: draft.jobDescription.trim(),
        targetCompany: draft.targetCompany.trim(),
        questionCount: draft.count,
        questionTypeConfig:
          draft.typeProfile === "default" ? undefined : TYPE_PROFILES[draft.typeProfile],
        resumeId: draft.resumeId,
        resumeText: draft.resumeText,
        modelProvider: draft.modelProvider,
        skillId: draft.selectedSkillId ?? undefined,
      });
      localStorage.removeItem(storageKey(mode));
      toast.success(mode === "voice" ? "语音面试已创建" : "面试题目已生成");
      if (mode === "voice") {
        await navigate({ to: "/voice/session/$id", params: { id: sessionId } });
      } else {
        await navigate({ to: "/session/$id", params: { id: sessionId } });
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "创建面试失败");
    } finally {
      setLoading(false);
    }
  }

  return {
    step,
    setStep,
    skills,
    draft,
    patchDraft,
    selectedSkill,
    loading,
    hydrating,
    selectSkill,
    selectCustom,
    goToDetails,
    submit,
  };
}
