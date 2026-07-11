/** interview-create - Skill 标签展示 */
import type { SkillMeta } from "../types";

/**
 * skill tags
 *
 * @param skill - 
 * @returns 
 */
export function SkillTags({ skill }: { skill: SkillMeta | null }) {
  if (!skill) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {skill.categories
        .filter((category) => category.priority !== "ALWAYS_ONE")
        .map((category) => (
          <span
            key={category.key}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground"
          >
            {category.label}
            <span className="ml-1 opacity-60">
              {category.priority === "CORE" ? "★" : "○"}
            </span>
          </span>
        ))}
    </div>
  );
}

