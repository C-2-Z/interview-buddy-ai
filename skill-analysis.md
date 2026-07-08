# Skill 驱动出题机制分析 & 实施建议

---

## 一、interview-guide 的 Skill 驱动出题完整架构

### 1.1 核心思想

interview-guide 不是用通用的面试官 prompt 生成题目，而是把每个面试方向拆成三部分：

```
[Skill 定义] -> SKILL.md（出题人设 + 出题约束）+ skill.meta.yml（分类元数据 + 参考题库索引）+ references/（知识点参考）
      |
[SkillService] -> 按分类计算分配数量 + 加载 references 拼入 prompt + 过滤历史已考题 + 调 LLM
```

### 1.2 文件结构

```
app/src/main/resources/skills/
+-- _shared/references/           # 共享参考题库
    +-- java.md, mysql.md, redis.md ...
+-- java-backend/                # 每个 Skill 一个目录
    +-- SKILL.md                 # 出题人设 (YAML front matter + Markdown body)
    +-- skill.meta.yml           # 分类配置 + 参考索引
    +-- references/spring.md     # 独有参考
+-- frontend/                    # 同上
    +-- SKILL.md + skill.meta.yml + references/
+-- ai-agent-dev/ ...
+-- bytedance-backend/ ...
+-- ali-backend/ ...
```

### 1.3 三个核心文件详解

#### (A) SKILL.md - 出题人设与约束

分为 YAML front matter（name + description）和 Markdown body（完整面试官角色描述）：

```yaml
---
name: java-backend
description: 用于 Java 后端面试出题...
---
```

Body 包含面试官角色、出题规则、难度梯度、追问要求等。

#### (B) skill.meta.yml - 分类与参考索引

```yaml
displayName: Java 后端开发
categories:
  - key: JAVA           # 分类标识
    label: Java
    priority: CORE       # CORE/NORMAL/ALWAYS_ONE
    ref: java.md         # 参考题库文件
    shared: true         # true=用 _shared 目录的
  - key: PROJECT
    label: 项目经历
    priority: ALWAYS_ONE # 保底 1 题
```

#### (C) references/*.md - 参考题库

各个 .md 文件包含知识点清单和常考题目示例。LLM 出题时作为上下文注入。

### 1.4 出题核心流程

```
前端选 Skill + 题目数量
  |
calculateAllocation():
  Phase 1: ALWAYS_ONE 保底各 1 题
  Phase 2: 所有分类各分 1 题 (CORE 优先)
  Phase 3: 剩余名额按 CORE 优先轮转
  |
buildReferenceSection():
  只加载有题目分配的 reference 文件，拼成 Markdown 注入 prompt
  |
generateQuestionsBySkill():
  查询历史 topicSummary 去重 -> 渲染 prompt -> 调 LLM -> 返回
  |
前端渲染面试
```

### 1.5 分配算法示例

10 题, categories=[JAVA(CORE), MYSQL(CORE), SPRING(NORMAL), PROJECT(ALWAYS_ONE)]

- Phase 1: PROJECT=1, 剩 9
- Phase 2: JAVA=1, MYSQL=1, SPRING=1, 剩 6
- Phase 3: JAVA+1,MYSQL+1,SPRING+1,JAVA+1,MYSQL+1,SPRING+1
- 最终: PROJECT=1, JAVA=3, MYSQL=3, SPRING=2

---

## 二、你的项目现状分析

### 当前出题逻辑

api-server/src/routes/sessions.ts 中使用一个通用 prompt：

```
岗位: ${position}, 难度: ${difficulty}, 背景: ${background}
要求: 题目要贴合岗位和难度
```

问题：

- 通用 prompt 无法针对性定制出题风格
- 没有分类维度（技术/行为题比例由 LLM 自己决定）
- 没有历史去重
- 没有参考题库
- prompt 硬编码在代码中

### 已有的优势

1. 题库表（question_bank）- 已存预置题目
2. 题目类型配置（questionTypeConfig）- 前端可配置比例
3. 目标公司（targetCompany）- 已支持
4. 简历文本输入（resumeText）- 已支持

---

## 三、实施建议（8 步）

### 建议架构

```
api-server/src/lib/skills/
+-- index.ts              # SkillLoader (加载所有技能)
+-- _shared/references/   # 共享参考题库
    +-- java.md
    +-- mysql.md
    +-- redis.md
    +-- ...
+-- java-backend/
    +-- skill.json        # 分类与参考索引
    +-- persona.md        # 面试官人设
    +-- references/       # 独有参考
+-- frontend/ ...
+-- algorithm/ ...
+-- ...
```

### 第 1 步：定义 Skill 数据格式

api-server/src/lib/skills/skill-schema.ts

```typescript
interface CategoryDef {
  key: string;       // "JAVA"
  label: string;     // "Java"
  priority: "CORE" | "NORMAL" | "ALWAYS_ONE";
  ref?: string;      // "java.md"
}

interface SkillDef {
  id: string;         // "java-backend"
  name: string;       // "Java 后端开发"
  description: string;
  persona: string;     // 面试官角色
  categories: CategoryDef[];
}
```

### 第 2 步：创建 Skill 文件

创建 skill.json（分类配置）：

```json
{
  "id": "java-backend",
  "name": "Java 后端开发",
  "categories": [
    { "key": "JAVA", "label": "Java", "priority": "CORE", "ref": "java.md", "shared": true },
    { "key": "MYSQL", "label": "MySQL", "priority": "CORE", "ref": "mysql.md", "shared": true },
    { "key": "REDIS", "label": "Redis", "priority": "NORMAL", "ref": "redis.md", "shared": true },
    { "key": "PROJECT", "label": "项目经历", "priority": "ALWAYS_ONE" }
  ]
}
```

创建 persona.md（面试官角色 + 出题规则）

### 第 3 步：实现 SkillLoader

```typescript
// 启动时扫描 skills/ 目录加载所有技能
export function loadSkills() { ... }
export function getAllSkills(): SkillDef[] { ... }
export function getSkill(id: string): SkillDef | undefined { ... }
```

### 第 4 步：实现分配算法和参考题库加载

```typescript
function calculateAllocation(categories, totalQuestions): Map<string, number>
// Phase 1: ALWAYS_ONE 保底
// Phase 2: 各分类先分 1 题
// Phase 3: CORE 优先轮转

function loadReferenceSection(skillId, categories, allocation): string
// 遍历有题目分配的 category，读取对应 .md 文件，截断至 3000 字
```

### 第 5 步：历史去重

interview_questions 表加 topic_summary 字段。
出题时查询当前用户已完成面试的 topicSummary 列表，注入 prompt。

### 第 6 步：改造出题 API

POST /api/sessions 接收 skillId 替代 position。
prompt 改为动态拼接：skill.persona + allocationTable + references + historicalTopics

### 第 7 步：前端接口

新增 GET /api/skills 返回全部 Skill 列表。
前端选择页从输入岗位改为选择预设 Skill + 可选自定义 JD。

### 第 8 步：清理旧代码（可选）

删除旧的 question_bank 表和相关路由。

---

## 四、实施优先级

| 步骤 | 内容                       | 工时   | 难度 |
| ---- | -------------------------- | ------ | ---- |
| 1    | 定义数据格式 + SkillLoader | 1 天   | 低   |
| 2    | 创建 5 个 Skill 文件       | 2 天   | 低   |
| 3    | 实现分配算法 + 去重        | 0.5 天 | 低   |
| 4    | 改造出题流程               | 1 天   | 中   |
| 5    | 前端接口 + 选择页          | 0.5 天 | 低   |
| 6    | 写参考题库                 | 2 天   | 低   |

总计约 7 天，步骤 1-4 可并行，实际约 3-4 天可见效果。

---

## 五、关键设计决策

| 决策点              | 推荐方案                       | 理由                    |
| ------------------- | ------------------------------ | ----------------------- |
| Skill 文件位置      | api-server/src/lib/skills/     | 紧挨后端代码            |
| 文件格式            | JSON + Markdown                | 比 YAML 更 Node.js 友好 |
| 题库存文件还是 DB   | 文件 (.md)                     | 题库变化不频繁，易编辑  |
| 是否要 _shared 题库 | 是                             | 多 Skill 可共用参考     |
| 追问功能            | prompt 要求 LLM 生成 followUps | 你的项目已有追问        |
| JD 解析             | 第一期先不做                   | 高级功能                |
