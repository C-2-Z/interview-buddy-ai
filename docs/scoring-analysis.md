# 评分系统分析：多维度加权计算与弱项分析聚合逻辑

> 版本: 1.0 | 最后更新: 2026-07-11

---

## 文件索引

| 文件 | 内容 |
|------|------|
| evaluation/evaluation.types.ts | 全部类型定义 |
| evaluation/evaluation.service.ts | 核心逻辑：aggregateDimensions() + identifyWeaknesses() |
| evaluation/evaluation.schemas.ts | 维度评分反序列化校验 |
| evaluation/evaluation.repository.ts | DB 读写 |
| questions/evaluation.service.ts | AI 调用端（生成维度评分） |
| questions/prompt-builders.ts | Prompt 模板 |
| questions/questions.repository.ts | 单题评分落库 |
| sessions/sessions.service.ts | finishSession() 编排入口 |
| questions/questions.service.ts | 调用端（传递 dimensionScores） |

## 多重维度加权计算

### 类型体系
- DimensionScoreItem: 单维度评分 = { score: 1-100, comment: string }
- DimensionScores: 单题多维度 = Record<string, DimensionScoreItem>
- DimensionDef: 维度定义 = { key, label, description, weight }
- AggregatedDimension: 聚合结果 = { score(均值), count(出现次数), weight }
- DimensionSummary: 面试汇总 = { dimensions, overallScore, strengths[], weaknesses[] }

### 维度定义（getDimensionDefs）
- 3 个通用维度固定存在：COMMUNICATION / LOGICAL_THINKING / PROBLEM_SOLVING (weight=2)
- Skill 专业维度从 categories 映射：CORE=3, NORMAL=2, ALWAYS_ONE=1
- 未关联 Skill 时只返回 3 个通用维度

### AI 评分调用
- evaluateConversation() 调用 AI 返回 {score, feedback, dimensions}
- 当前未传入 dimensionPrompt（第三个参数），AI 未收到正式维度列表
- validateDimensionScores() 校验 AI 返回：key 防注入、分数钳位 [1,100]、评语截断 500 字

### 聚合算法（aggregateDimensions）
1. 初始化桶：根据 dimensionDefs 为每个维度创建 {scores[], weight}
2. 收集数据：遍历每道题的 dimension_scores，分数入对应桶
3. 算术平均：同维度所有分数求和/个数 = 维度均分
4. 加权求和：totalScore = sum(avg * weight) / sum(weight)
5. 调用 identifyWeaknesses() 识别强弱项

## 弱项分析聚合逻辑

### identifyWeaknesses 算法
1. 排序：所有维度按均分降序排列，过滤 score=0 的维度
2. 标签映射：硬编码 labelMap 转换英文 key 为中文名
3. 强项：slice(0,3) 取 Top 3，filter(>=70)，格式化 "沟通表达(85分)"
4. 弱项：slice(-3) 取 Bottom 3，filter(<70)，格式化 "数据结构与算法(55分)"

### 边界场景
- 全 >=70: strengths 有值, weaknesses 为空
- 全 <70: strengths 为空, weaknesses 有值
- 仅 1 个维度: slice(0,3) / slice(-3) 自动取全部
- 恰好 70 分: 既不属强项也不属弱项

## 发现的问题
1. 未使用的 import: questions/evaluation.service.ts 导入了 getDimensionDefs / buildDimensionPromptSection / findSkill 但未调用
2. dimensionPrompt 未传入 AI prompt，AI 在评分时没有收到正式的维度列表
3. labelMap 硬编码 21 个维度，新增 Skill 时容易忘记维护
