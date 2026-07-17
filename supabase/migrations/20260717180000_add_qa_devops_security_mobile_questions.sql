-- Agent v3 question diversity: four new controlled job families with curated seed questions.
-- QA, DevOps, Security, and Mobile engineer pools at every difficulty and controlled intent.

-- Extend the job_family_keys CHECK constraint to include the new families.
ALTER TABLE public.question_bank
  DROP CONSTRAINT IF EXISTS question_bank_job_family_keys_check;
ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_job_family_keys_check CHECK (
    cardinality(job_family_keys) > 0 AND
    job_family_keys <@ ARRAY['frontend','java_backend','fullstack','data_analysis','product','algorithm','general',
      'qa','devops','security','mobile']::TEXT[]
  );

-- ============================================================
-- 1. QA / 测试工程师
-- ============================================================
WITH dimensions(job_family, position, dimension_key, label) AS (
  VALUES
    ('qa','测试工程师','TEST_BASICS','测试基础理论'),
    ('qa','测试工程师','AUTOMATION','自动化测试'),
    ('qa','测试工程师','PERF_TEST','性能与压力测试'),
    ('qa','测试工程师','QUALITY_PROCESS','质量体系与流程')
), difficulties(difficulty,difficulty_key) AS (
  VALUES ('初级','junior'),('中级','intermediate'),('高级','senior')
),
families(family_no, intent_key, stage_keys, evidence_keys) AS (
  VALUES
    (1,'knowledge_check',ARRAY['opening','core']::TEXT[],ARRAY['concept','tradeoff','boundary']::TEXT[]),
    (2,'project_evidence',ARRAY['opening','core']::TEXT[],ARRAY['situation','action','result','reflection']::TEXT[]),
    (3,'scenario_reasoning',ARRAY['opening','core']::TEXT[],ARRAY['diagnosis','action','tradeoff','result']::TEXT[])
)
INSERT INTO public.question_bank(
  position,difficulty,type,question,tags,role_ids,dimension_keys,topic_keys,evidence_goal_keys,
  job_family_keys,intent_key,stage_keys,question_family_key,quality_score,active
)
SELECT d.position,lv.difficulty,
  CASE f.intent_key WHEN 'knowledge_check' THEN '技术题' WHEN 'project_evidence' THEN '行为题' ELSE '场景题' END,
  CASE f.family_no
    WHEN 1 THEN format('请说明%s中一个关键测试方法的核心原理、适用场景和常见误区。',d.label)
    WHEN 2 THEN format('请结合一个真实项目，说明你如何运用%s提升质量、发现关键缺陷并推动改进。',d.label)
    ELSE format('一个严重线上缺陷被遗漏到生产环境，你会如何复盘根因、修复验证并补充测试防线？',d.label)
  END,
  ARRAY[d.dimension_key,d.label],ARRAY['general','technical']::TEXT[],ARRAY[d.dimension_key],
  ARRAY[lower(d.dimension_key),d.job_family],f.evidence_keys,ARRAY[d.job_family],f.intent_key,f.stage_keys,
  d.job_family || '-' || lower(d.dimension_key) || '-' || lv.difficulty_key || '-' || f.family_no,
  90,TRUE
FROM dimensions d CROSS JOIN difficulties lv CROSS JOIN families f
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. DevOps / DevOps 工程师
-- ============================================================
WITH dimensions(job_family, position, dimension_key, label) AS (
  VALUES
    ('devops','DevOps工程师','CI_CD','CI/CD 流水线'),
    ('devops','DevOps工程师','CLOUD_INFRA','云基础设施'),
    ('devops','DevOps工程师','OBSERVABILITY','可观测性'),
    ('devops','DevOps工程师','CONTAINER_ORCH','容器与编排')
), difficulties(difficulty,difficulty_key) AS (
  VALUES ('初级','junior'),('中级','intermediate'),('高级','senior')
),
families(family_no, intent_key, stage_keys, evidence_keys) AS (
  VALUES
    (1,'knowledge_check',ARRAY['opening','core']::TEXT[],ARRAY['concept','tradeoff','boundary']::TEXT[]),
    (2,'project_evidence',ARRAY['opening','core']::TEXT[],ARRAY['situation','action','result','reflection']::TEXT[]),
    (3,'scenario_reasoning',ARRAY['opening','core']::TEXT[],ARRAY['diagnosis','action','tradeoff','result']::TEXT[])
)
INSERT INTO public.question_bank(
  position,difficulty,type,question,tags,role_ids,dimension_keys,topic_keys,evidence_goal_keys,
  job_family_keys,intent_key,stage_keys,question_family_key,quality_score,active
)
SELECT d.position,lv.difficulty,
  CASE f.intent_key WHEN 'knowledge_check' THEN '技术题' WHEN 'project_evidence' THEN '行为题' ELSE '场景题' END,
  CASE f.family_no
    WHEN 1 THEN format('请说明%s中一个核心实践的原理、设计取舍和常见反模式。',d.label)
    WHEN 2 THEN format('请结合一个真实项目，说明你如何通过%s改进交付效率或稳定性，并验证效果。',d.label)
    ELSE format('一次变更导致生产环境故障，你会如何止血、定位根因并改进流水线防止再发？',d.label)
  END,
  ARRAY[d.dimension_key,d.label],ARRAY['general','technical']::TEXT[],ARRAY[d.dimension_key],
  ARRAY[lower(d.dimension_key),d.job_family],f.evidence_keys,ARRAY[d.job_family],f.intent_key,f.stage_keys,
  d.job_family || '-' || lower(d.dimension_key) || '-' || lv.difficulty_key || '-' || f.family_no,
  90,TRUE
FROM dimensions d CROSS JOIN difficulties lv CROSS JOIN families f
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. Security / 安全工程师
-- ============================================================
WITH dimensions(job_family, position, dimension_key, label) AS (
  VALUES
    ('security','安全工程师','SEC_BASICS','安全基础'),
    ('security','安全工程师','APP_SEC','应用安全'),
    ('security','安全工程师','NETWORK_SEC','网络安全'),
    ('security','安全工程师','SEC_OPS','安全运营')
), difficulties(difficulty,difficulty_key) AS (
  VALUES ('初级','junior'),('中级','intermediate'),('高级','senior')
),
families(family_no, intent_key, stage_keys, evidence_keys) AS (
  VALUES
    (1,'knowledge_check',ARRAY['opening','core']::TEXT[],ARRAY['concept','tradeoff','boundary']::TEXT[]),
    (2,'project_evidence',ARRAY['opening','core']::TEXT[],ARRAY['situation','action','result','reflection']::TEXT[]),
    (3,'scenario_reasoning',ARRAY['opening','core']::TEXT[],ARRAY['diagnosis','action','tradeoff','result']::TEXT[])
)
INSERT INTO public.question_bank(
  position,difficulty,type,question,tags,role_ids,dimension_keys,topic_keys,evidence_goal_keys,
  job_family_keys,intent_key,stage_keys,question_family_key,quality_score,active
)
SELECT d.position,lv.difficulty,
  CASE f.intent_key WHEN 'knowledge_check' THEN '技术题' WHEN 'project_evidence' THEN '行为题' ELSE '场景题' END,
  CASE f.family_no
    WHEN 1 THEN format('请说明%s中一个关键安全机制的核心原理、攻击面覆盖范围和局限性。',d.label)
    WHEN 2 THEN format('请结合一个真实项目，说明你如何识别并修复%s方向的安全风险，并验证防护效果。',d.label)
    ELSE format('发现一个正在被利用的安全漏洞，你会如何应急响应、定位影响面并推动修复？',d.label)
  END,
  ARRAY[d.dimension_key,d.label],ARRAY['general','technical']::TEXT[],ARRAY[d.dimension_key],
  ARRAY[lower(d.dimension_key),d.job_family],f.evidence_keys,ARRAY[d.job_family],f.intent_key,f.stage_keys,
  d.job_family || '-' || lower(d.dimension_key) || '-' || lv.difficulty_key || '-' || f.family_no,
  90,TRUE
FROM dimensions d CROSS JOIN difficulties lv CROSS JOIN families f
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. Mobile / 移动端工程师
-- ============================================================
WITH dimensions(job_family, position, dimension_key, label) AS (
  VALUES
    ('mobile','移动端工程师','NATIVE_DEV','原生开发'),
    ('mobile','移动端工程师','CROSS_PLATFORM','跨平台'),
    ('mobile','移动端工程师','MOBILE_ARCH','移动端架构'),
    ('mobile','移动端工程师','MOBILE_PERF','移动端性能与体验')
), difficulties(difficulty,difficulty_key) AS (
  VALUES ('初级','junior'),('中级','intermediate'),('高级','senior')
),
families(family_no, intent_key, stage_keys, evidence_keys) AS (
  VALUES
    (1,'knowledge_check',ARRAY['opening','core']::TEXT[],ARRAY['concept','tradeoff','boundary']::TEXT[]),
    (2,'project_evidence',ARRAY['opening','core']::TEXT[],ARRAY['situation','action','result','reflection']::TEXT[]),
    (3,'scenario_reasoning',ARRAY['opening','core']::TEXT[],ARRAY['diagnosis','action','tradeoff','result']::TEXT[])
)
INSERT INTO public.question_bank(
  position,difficulty,type,question,tags,role_ids,dimension_keys,topic_keys,evidence_goal_keys,
  job_family_keys,intent_key,stage_keys,question_family_key,quality_score,active
)
SELECT d.position,lv.difficulty,
  CASE f.intent_key WHEN 'knowledge_check' THEN '技术题' WHEN 'project_evidence' THEN '行为题' ELSE '场景题' END,
  CASE f.family_no
    WHEN 1 THEN format('请说明%s中一个关键机制的原理、平台差异和在实际开发中的局限性。',d.label)
    WHEN 2 THEN format('请结合一个真实项目，说明你如何在%s方向做出技术选型、解决性能或体验问题。',d.label)
    ELSE format('用户在低端设备上反馈严重卡顿或闪退，你会如何分层排查、定位瓶颈并优化？',d.label)
  END,
  ARRAY[d.dimension_key,d.label],ARRAY['general','technical']::TEXT[],ARRAY[d.dimension_key],
  ARRAY[lower(d.dimension_key),d.job_family],f.evidence_keys,ARRAY[d.job_family],f.intent_key,f.stage_keys,
  d.job_family || '-' || lower(d.dimension_key) || '-' || lv.difficulty_key || '-' || f.family_no,
  90,TRUE
FROM dimensions d CROSS JOIN difficulties lv CROSS JOIN families f
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. General baseline: 四个新岗位的角色-维度覆盖
-- ============================================================
WITH difficulties(difficulty,difficulty_key) AS (
  VALUES ('初级','junior'),('中级','intermediate'),('高级','senior')
),
role_dimensions(role_id,dimension_key,label,job_family) AS (
  VALUES
    ('general','COMMUNICATION','沟通表达','qa'),
    ('general','LOGICAL_THINKING','逻辑思维','qa'),
    ('general','PROBLEM_SOLVING','问题解决','qa'),
    ('technical','TECHNICAL_DEPTH','技术深度','qa'),
    ('technical','LOGICAL_THINKING','逻辑思维','qa'),
    ('technical','PROBLEM_SOLVING','问题解决','qa'),
    ('technical','COMMUNICATION','技术沟通','qa'),
    ('general','COMMUNICATION','沟通表达','devops'),
    ('general','LOGICAL_THINKING','逻辑思维','devops'),
    ('general','PROBLEM_SOLVING','问题解决','devops'),
    ('technical','TECHNICAL_DEPTH','技术深度','devops'),
    ('technical','LOGICAL_THINKING','逻辑思维','devops'),
    ('technical','PROBLEM_SOLVING','问题解决','devops'),
    ('technical','COMMUNICATION','技术沟通','devops'),
    ('general','COMMUNICATION','沟通表达','security'),
    ('general','LOGICAL_THINKING','逻辑思维','security'),
    ('general','PROBLEM_SOLVING','问题解决','security'),
    ('technical','TECHNICAL_DEPTH','技术深度','security'),
    ('technical','LOGICAL_THINKING','逻辑思维','security'),
    ('technical','PROBLEM_SOLVING','问题解决','security'),
    ('technical','COMMUNICATION','技术沟通','security'),
    ('general','COMMUNICATION','沟通表达','mobile'),
    ('general','LOGICAL_THINKING','逻辑思维','mobile'),
    ('general','PROBLEM_SOLVING','问题解决','mobile'),
    ('technical','TECHNICAL_DEPTH','技术深度','mobile'),
    ('technical','LOGICAL_THINKING','逻辑思维','mobile'),
    ('technical','PROBLEM_SOLVING','问题解决','mobile'),
    ('technical','COMMUNICATION','技术沟通','mobile')
),
families(family_no,intent_key,type,evidence_keys) AS (
  VALUES
    (1,'knowledge_check','技术题',ARRAY['concept','tradeoff','boundary']::TEXT[]),
    (2,'scenario_reasoning','场景题',ARRAY['constraints','diagnosis','action','tradeoff','result']::TEXT[]),
    (3,'behavioral_evidence','行为题',ARRAY['situation','action','result','reflection']::TEXT[])
)
INSERT INTO public.question_bank(
  position,difficulty,type,question,tags,role_ids,dimension_keys,topic_keys,evidence_goal_keys,
  job_family_keys,intent_key,stage_keys,question_family_key,quality_score,active
)
SELECT '通用',d.difficulty,f.type,
  CASE f.family_no
    WHEN 1 THEN format('请说明%s中一个你认为关键的方法，并解释适用条件、限制和取舍。',rd.label)
    WHEN 2 THEN format('遇到一个主要考验%s且信息不完整的工作场景时，你会如何澄清、行动并验证结果？',rd.label)
    ELSE format('请分享一次能证明你%s能力的真实经历，说明你的责任、具体行动、结果和复盘。',rd.label)
  END,
  ARRAY[lower(rd.dimension_key),rd.role_id],ARRAY[rd.role_id],ARRAY[rd.dimension_key],
  ARRAY[lower(rd.dimension_key),rd.role_id],f.evidence_keys,ARRAY[rd.job_family],f.intent_key,
  ARRAY['opening','core']::TEXT[],
  'general-baseline-' || rd.job_family || '-' || rd.role_id || '-' || lower(rd.dimension_key) || '-' || d.difficulty_key || '-' || f.family_no,
  86,TRUE
FROM difficulties d CROSS JOIN role_dimensions rd CROSS JOIN families f
ON CONFLICT DO NOTHING;
