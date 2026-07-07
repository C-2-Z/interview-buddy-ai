-- Question Bank: stores reusable interview questions
CREATE TABLE public.question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN (''初级'', ''中级'', ''高级'')),
  type TEXT NOT NULL CHECK (type IN (''技术题'', ''行为题'', ''场景题'', ''系统设计'')),
  question TEXT NOT NULL,
  tags TEXT[] DEFAULT ''{}'',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

-- Everyone can read, only service_role can write
CREATE POLICY "Anyone can read question bank" ON public.question_bank
  FOR SELECT USING (true);

GRANT SELECT ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;

-- User favorites
CREATE TABLE public.favorite_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE public.favorite_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favorites" ON public.favorite_questions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.favorite_questions TO authenticated;
GRANT ALL ON public.favorite_questions TO service_role;

-- Indexes
CREATE INDEX idx_question_bank_position ON public.question_bank(position);
CREATE INDEX idx_question_bank_difficulty ON public.question_bank(difficulty);
CREATE INDEX idx_question_bank_type ON public.question_bank(type);
CREATE INDEX idx_favorites_user ON public.favorite_questions(user_id);

-- Seed data
INSERT INTO public.question_bank (position, difficulty, type, question, tags) VALUES
-- 前端工程师
(''前端工程师'', ''初级'', ''技术题'', ''请解释 CSS 的盒模型（Box Model），以及 content-box 和 border-box 的区别。'', ARRAY[''CSS'', ''盒模型'']),
(''前端工程师'', ''初级'', ''技术题'', ''JavaScript 中 var、let 和 const 的区别是什么？请举例说明。'', ARRAY[''JavaScript'', ''变量'']),
(''前端工程师'', ''中级'', ''技术题'', ''React 中 useEffect 的依赖数组是如何工作的？如果不传依赖数组会怎样？'', ARRAY[''React'', ''Hooks'', ''useEffect'']),
(''前端工程师'', ''中级'', ''技术题'', ''请解释浏览器的事件循环（Event Loop）机制，包括宏任务和微任务。'', ARRAY[''JavaScript'', ''事件循环'', ''异步'']),
(''前端工程师'', ''中级'', ''场景题'', ''如果一个页面加载速度很慢，你会从哪些维度进行性能优化？请列出你的排查思路。'', ARRAY[''性能优化'', ''加载速度'']),
(''前端工程师'', ''高级'', ''技术题'', ''请解释 React 的 Fiber 架构和 Reconciliation（协调）过程是如何工作的。'', ARRAY[''React'', ''Fiber'', ''Reconciliation'']),
(''前端工程师'', ''高级'', ''系统设计'', ''设计一个实时协作编辑器的前端架构，需要考虑多人同时编辑时的冲突处理和状态同步。'', ARRAY[''系统设计'', ''实时协作'', ''状态同步'']),
(''前端工程师'', ''初级'', ''行为题'', ''请分享一次你在团队中遇到技术分歧的经历，你是如何处理并最终达成一致的？'', ARRAY[''团队合作'', ''沟通'']),
(''前端工程师'', ''中级'', ''行为题'', ''描述一个你主导的前端项目，从需求分析到上线的完整过程。你在其中扮演了什么角色？'', ARRAY[''项目管理'', ''领导力'']),
(''前端工程师'', ''高级'', ''行为题'', ''当你的技术方案被上级或产品经理否决时，你是怎么处理的？'', ARRAY[''沟通'', ''决策'']),

-- 后端工程师
(''后端工程师'', ''初级'', ''技术题'', ''请解释 RESTful API 的设计原则，以及 GET、POST、PUT、DELETE 的区别。'', ARRAY[''REST'', ''API'', ''HTTP'']),
(''后端工程师'', ''中级'', ''技术题'', ''什么是数据库索引？B+ 树索引是如何工作的？什么时候索引会失效？'', ARRAY[''数据库'', ''索引'', ''B+树'']),
(''后端工程师'', ''中级'', ''技术题'', ''请解释 CAP 定理，以及在分布式系统中如何权衡一致性、可用性和分区容错性。'', ARRAY[''分布式'', ''CAP'', ''一致性'']),
(''后端工程师'', ''中级'', ''场景题'', ''你的 API 接口突然响应变慢，数据库 CPU 飙高，你会怎么排查和解决？'', ARRAY[''性能排查'', ''数据库'']),
(''后端工程师'', ''高级'', ''系统设计'', ''设计一个短链接生成服务，需要考虑高并发、唯一性、过期策略和访问统计。'', ARRAY[''系统设计'', ''短链接'', ''高并发'']),
(''后端工程师'', ''高级'', ''技术题'', ''请解释 Raft 共识算法的工作原理，包括 Leader 选举、日志复制和安全性保证。'', ARRAY[''分布式'', ''Raft'', ''共识算法'']),
(''后端工程师'', ''高级'', ''行为题'', ''你在技术选型时是如何做决策的？举一个具体例子说明你如何权衡不同方案的优劣势。'', ARRAY[''技术选型'', ''决策'']),

-- 数据分析师
(''数据分析师'', ''初级'', ''技术题'', ''请解释什么是假设检验？p 值是什么意思？'', ARRAY[''统计学'', ''假设检验'', ''p值'']),
(''数据分析师'', ''中级'', ''技术题'', ''SQL 中 LEFT JOIN 和 INNER JOIN 的区别是什么？请举例说明使用场景。'', ARRAY[''SQL'', ''JOIN'']),
(''数据分析师'', ''中级'', ''场景题'', ''某产品的次日留存率突然下降了 10%，你会如何分析原因？请列出你的分析框架。'', ARRAY[''留存分析'', ''数据分析'']),
(''数据分析师'', ''高级'', ''技术题'', ''请解释 A/B 测试的原理和常见陷阱，包括多重比较问题和辛普森悖论。'', ARRAY[''A/B测试'', ''统计学'']),
(''数据分析师'', ''高级'', ''行为题'', ''请分享一次你用数据驱动业务决策的经历，数据结论和业务方预期不一致时你是怎么处理的？'', ARRAY[''数据驱动'', ''沟通'']),

-- 产品经理
(''产品经理'', ''初级'', ''场景题'', ''如果你负责的一个功能上线后用户使用率很低，你会怎么做？'', ARRAY[''产品运营'', ''用户分析'']),
(''产品经理'', ''中级'', ''行为题'', ''请描述一次你如何平衡用户需求、技术实现和业务目标来做出产品决策的经历。'', ARRAY[''产品决策'', ''平衡'']),
(''产品经理'', ''中级'', ''场景题'', ''你的项目 deadline 临近但核心功能还没完成，你会怎么调整计划和与各方沟通？'', ARRAY[''项目管理'', ''沟通'']),
(''产品经理'', ''高级'', ''系统设计'', ''设计一个在线教育产品的会员订阅系统，考虑用户分层、权益设计、付费转化和续费策略。'', ARRAY[''产品设计'', ''会员体系'']),

-- 全栈工程师
(''全栈工程师'', ''中级'', ''技术题'', ''请解释 JWT（JSON Web Token）的结构和工作原理，以及如何保证其安全性。'', ARRAY[''JWT'', ''认证'', ''安全'']),
(''全栈工程师'', ''中级'', ''场景题'', ''你的 Web 应用出现了跨域问题（CORS），请解释原因并给出解决方案。'', ARRAY[''CORS'', ''跨域'', ''前端'']),
(''全栈工程师'', ''高级'', ''系统设计'', ''设计一个秒杀系统，需要考虑高并发、库存扣减的原子性和防超卖。'', ARRAY[''系统设计'', ''秒杀'', ''高并发'']),
(''全栈工程师'', ''高级'', ''技术题'', ''请解释如何设计一套可扩展的权限管理系统（RBAC），包括角色、权限、资源的设计思路。'', ARRAY[''权限管理'', ''RBAC'', ''系统设计'']),

-- 通用行为题
(''通用'', ''初级'', ''行为题'', ''请做一个简单的自我介绍，包括你的技术背景和为什么对这个岗位感兴趣。'', ARRAY[''自我介绍'']),
(''通用'', ''中级'', ''行为题'', ''请描述一次你如何在工作中快速学习一项新技术的经历。'', ARRAY[''学习能力'', ''适应力'']),
(''通用'', ''高级'', ''行为题'', ''请分享一次你失败的项目经历。你从中学到了什么？如果重来你会怎么做？'', ARRAY[''失败经历'', ''反思'', ''成长'']);
