/** 前端 Agent 契约：与后端持久事件和工作台投影保持一致。 */
export type AgentMode="single"|"panel";
export type AgentPhase="preparing"|"awaiting_answer"|"reasoning"|"speaking"|"scoring"|"role_handoff"|"reporting"|"completed"|"failed";
export type AgentRoleId="general"|"technical"|"manager"|"hr";
export type AgentPendingAction="ask"|"follow_up"|"score"|"handoff"|"finish";

/** 可恢复 Agent 快照。 */
export type AgentSnapshot=Readonly<{
  /** 会话 UUID。 */ sessionId:string;
  /** LangGraph thread ID。 */ threadId:string;
  /** 状态版本。 */ version:string;
  /** 单角色或面板。 */ mode:AgentMode;
  /** 文本或语音。 */ interviewMode:"text"|"voice";
  /** 当前阶段。 */ phase:AgentPhase;
  /** 当前角色。 */ currentRole:AgentRoleId;
  /** 当前题目 UUID。 */ currentQuestionId:string|null;
  /** 零基题号。 */ currentQuestionIndex:number;
  /** 当前题追问次数。 */ followUpCount:number;
  /** 下一受控动作。 */ pendingAction:AgentPendingAction;
  /** 已提交事件水位。 */ eventCursor:number;
}>;

/** 创建 Agent 会话请求。 */
export type CreateAgentSessionBody=Readonly<{
  /** 角色模式。 */ mode:AgentMode;
  /** 交互通道。 */ interviewMode:"text"|"voice";
  /** 岗位。 */ position:string;
  /** 难度。 */ difficulty:"初级"|"中级"|"高级";
  /** 题数。 */ questionCount:number;
  /** JD。 */ jobDescription?:string;
  /** 目标公司。 */ targetCompany?:string;
  /** Skill UUID/ID。 */ skillId?:string;
  /** 简历 UUID。 */ resumeId?:string;
  /** 模型供应商。 */ modelProvider?:"deepseek"|"openai"|"anthropic";
  /** 模型名。 */ modelName?:string;
  /** 是否联网研究。 */ webResearch?:boolean;
}>;

/** 创建响应。 */
export type CreateAgentSessionResponse=Readonly<{sessionId:string;threadId:string;phase:AgentPhase;eventCursor:number}>;
/** 文本输入。 */
export type AgentInputBody=Readonly<{inputId:string;type:"text";content:string}>;
/** 会话读取响应。 */
export type AgentSessionView=Readonly<{snapshot:AgentSnapshot}>;

/** 一条 Agent 消息。 */
export type AgentWorkspaceMessage={id:string;role:"user"|"assistant";content:string;source:"text"|"voice";interrupted:boolean;createdAt:string};
/** 一题的证据与评分。 */
export type AgentWorkspaceQuestion={
  id:string;question:string;orderIndex:number;roleId:AgentRoleId;dimensionKey:string;source:"bank"|"model";score:number|null;feedback:string|null;
  messages:AgentWorkspaceMessage[];
  evidence:Array<{id:string;dimensionKey:string;claim:string;quote:string}>;
  evaluation:null|{overallScore:number;dimensions:Record<string,{score:number;rationale:string;evidenceIds:string[]}>};
};
/** 完整工作台读取模型。 */
export type AgentWorkspace={
  snapshot:AgentSnapshot;
  config:{position:string;difficulty:string;questionCount:number;targetCompany:string|null};
  research:{status:"pending"|"running"|"completed"|"skipped"|"failed";sources:Array<{id:string;category:"company"|"role"|"industry";title:string;url:string}>};
  questions:AgentWorkspaceQuestion[];
  report:null|{overallScore:number;overallFeedback:string;dimensionSummary:unknown};
};

/** 后端持久事件联合。 */
export type AgentSSEEvent=
  |{sequence:number;type:"agent.snapshot";data:AgentSnapshot}
  |{sequence:number;type:"agent.phase";data:{phase:AgentPhase}}
  |{sequence:number;type:"agent.role_changed";data:{roleId:AgentRoleId}}
  |{sequence:number;type:"agent.question_ready";data:{id:string;question:string;orderIndex:number;roleId:AgentRoleId;dimensionKey:string;source:"bank"|"model"}}
  |{sequence:number;type:"agent.message_completed";data:{id:string;role:"assistant";content:string;roleId:AgentRoleId;createdAt:string;interrupted:boolean}}
  |{sequence:number;type:"agent.score_completed";data:{questionId:string;overallScore:number;dimensions:Record<string,{score:number;rationale:string;evidenceIds:string[]}>}}
  |{sequence:number;type:"agent.session_completed";data:{sessionId:string;completedAt:string;overallScore?:number;overallFeedback?:string;dimensionSummary?:unknown}}
  |{sequence:number;type:"agent.error";data:{code:string;message:string;retryable:boolean}};

/** 角色展示。 */
export const AGENT_ROLE_DISPLAY:Record<AgentRoleId,{id:AgentRoleId;label:string;description:string;color:string}>={
  general:{id:"general",label:"综合面试官",description:"负责完整面试体验",color:"bg-blue-500"},
  technical:{id:"technical",label:"技术面试官",description:"技术深度与项目证据",color:"bg-emerald-500"},
  manager:{id:"manager",label:"主管面试官",description:"业务场景与决策",color:"bg-amber-500"},
  hr:{id:"hr",label:"HR 面试官",description:"动机与价值观",color:"bg-purple-500"},
};
/** 阶段中文名。 */
export const AGENT_PHASE_DISPLAY:Record<AgentPhase,string>={preparing:"准备中",awaiting_answer:"等待回答",reasoning:"思考中",speaking:"发言中",scoring:"评分中",role_handoff:"角色切换",reporting:"生成报告",completed:"已完成",failed:"失败"};
