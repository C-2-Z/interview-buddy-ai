/** 知识库子导航：Tab 切换 */

import { KNOWLEDGE_TABS } from "../constants";
import type { KnowledgeTab } from "../types";

/** Tab 切换组件属性 */
interface KnowledgeNavigationProps {
  activeTab: KnowledgeTab;
  onTabChange: (tab: KnowledgeTab) => void;
}

/** 知识库 Tab 切换栏 */
export function KnowledgeNavigation({ activeTab, onTabChange }: KnowledgeNavigationProps) {
  return (
    <div className="flex items-center gap-1 border-b px-6">
      {KNOWLEDGE_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`relative px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? "text-foreground after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
