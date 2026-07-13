/** Interview lifecycle 前端类型：描述用户动作、产品状态和安全响应。 */

/** 用户可触发的会话生命周期动作。 */
export type InterviewLifecycleAction="pause"|"resume"|"finish"|"abandon";

/** 面向用户的会话状态。 */
export type InterviewProductStatus="in_progress"|"paused"|"completed"|"abandoned"|"failed";

/** 生命周期动作响应。 */
export type InterviewLifecycleResult=Readonly<{
  /** 业务会话 UUID。 */ sessionId:string;
  /** 动作完成后的产品状态。 */ status:InterviewProductStatus;
  /** 是否已有报告。 */ reportAvailable:boolean;
  /** 已评分题数。 */ evaluatedQuestionCount:number;
  /** 配置总题数。 */ totalQuestionCount:number;
}>;

/** 整场删除确认。 */
export type InterviewDeleteResult=Readonly<{/** 已删除会话 UUID。 */sessionId:string;/** 固定删除成功标记。 */deleted:true}>;
