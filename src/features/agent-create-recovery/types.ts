/** Agent 创建失败恢复 feature 的稳定展示契约。 */

/** 创建失败后允许页面执行的恢复动作。 */
export type AgentCreateRecoveryAction="retry_create"|"recheck"|"open_settings"|"contact_admin";

/** 创建失败的脱敏用户提示。 */
export type AgentCreateFailure={
  /** 后端稳定错误码或客户端网络错误码。 */code:string;
  /** 说明失败原因且不包含内部堆栈。 */message:string;
  /** 是否允许保留当前草稿原地重试。 */retryable:boolean;
  /** 当前最合适的唯一主恢复动作。 */action:AgentCreateRecoveryAction;
};
