import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createInterviewSession,
  listSkills,
} from "../api";
import { TYPE_PROFILES } from "../constants";
import type {
  CreateSessionParams,
  Difficulty,
  ModelProviderName,
  SkillMeta,
} from "../types";

export function useCreateInterview() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [position, setPosition] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("中级");
  const [jobDescription, setJobDescription] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [typeProfile, setTypeProfile] = useState("default");
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [count, setCount] = useState(5);
  const [modelProvider, setModelProvider] =
    useState<ModelProviderName>("deepseek");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listSkills().then(setSkills).catch(() => setSkills([]));
  }, []);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) ?? null,
    [selectedSkillId, skills],
  );

  function selectSkill(skillId: string) {
    const skill = skills.find((item) => item.id === skillId);
    setSelectedSkillId(skillId);
    setUseCustom(false);
    if (skill) setPosition(skill.name);
  }

  function selectCustom() {
    setSelectedSkillId(null);
    setUseCustom(true);
    setPosition("");
  }

  function clearResume() {
    setResumeText("");
    setResumeName("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!position.trim()) {
      toast.error("请填写或选择面试岗位");
      return;
    }

    setLoading(true);
    try {
      const params: CreateSessionParams = {
        position,
        difficulty,
        jobDescription,
        targetCompany,
        resumeText,
        questionTypeConfig:
          typeProfile === "default" ? undefined : TYPE_PROFILES[typeProfile],
        questionCount: count,
        modelProvider,
        skillId: selectedSkillId ?? undefined,
      };
      const { sessionId } = await createInterviewSession(params);
      toast.success("题目已生成");
      navigate({ to: "/session/$id", params: { id: sessionId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return {
    skills,
    selectedSkill,
    selectedSkillId,
    useCustom,
    position,
    setPosition,
    difficulty,
    setDifficulty,
    jobDescription,
    setJobDescription,
    targetCompany,
    setTargetCompany,
    typeProfile,
    setTypeProfile,
    resumeText,
    setResumeText,
    resumeName,
    setResumeName,
    clearResume,
    count,
    setCount,
    modelProvider,
    setModelProvider,
    loading,
    selectSkill,
    selectCustom,
    submit,
  };
}

