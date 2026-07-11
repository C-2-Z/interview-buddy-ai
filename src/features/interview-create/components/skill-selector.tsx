/** interview-create - Skill 选择器 */
import type { ReactNode } from "react";
import { Brain, Code2, Lightbulb, Palette, Pencil } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { SkillMeta } from "../types";

const SKILL_ICONS: Record<string, ReactNode> = {
  "java-backend": <Code2 className="w-5 h-5" />,
  frontend: <Palette className="w-5 h-5" />,
  algorithm: <Brain className="w-5 h-5" />,
  product: <Lightbulb className="w-5 h-5" />,
};

type SkillSelectorProps = {
  skills: SkillMeta[];
  selectedSkillId: string | null;
  useCustom: boolean;
  onSelectSkill: (skillId: string) => void;
  onSelectCustom: () => void;
};

/**
 * skill selector
 * @returns
 */
export function SkillSelector({
  skills,
  selectedSkillId,
  useCustom,
  onSelectSkill,
  onSelectCustom,
}: SkillSelectorProps) {
  if (skills.length === 0) return null;

  return (
    <div className="space-y-3">
      <Label>面试方向</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {skills.map((skill) => (
          <button
            key={skill.id}
            type="button"
            onClick={() => onSelectSkill(skill.id)}
            className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
              selectedSkillId === skill.id
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <span className="shrink-0 text-muted-foreground">
              {SKILL_ICONS[skill.id] || <Code2 className="w-5 h-5" />}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{skill.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {skill.description}
              </div>
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={onSelectCustom}
          className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
            useCustom
              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          <span className="shrink-0 text-muted-foreground">
            <Pencil className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">自定义</div>
            <div className="text-xs text-muted-foreground truncate">
              自由输入岗位名称
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

