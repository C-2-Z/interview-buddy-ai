/** Agent 工作台 Service：把最新事件快照与只读业务投影合并。 */
import type { InterviewAgentService } from "../interview-agent.service.js";
import type { AgentWorkspaceRepository } from "./workspace.repository.js";
import type { AgentWorkspace } from "./workspace.types.js";

/** 页面恢复业务服务。 */
export class AgentWorkspaceService {
  /** @param agentService - 快照真相源。 @param repository - 业务投影真相源。 */
  constructor(
    private readonly agentService: Pick<InterviewAgentService,"getSession">,
    private readonly repository: AgentWorkspaceRepository,
  ) {}

  /** 加载同一用户拥有的完整 Agent 工作台。 */
  async load(sessionId:string):Promise<AgentWorkspace>{
    const [view,workspace]=await Promise.all([
      this.agentService.getSession(sessionId),
      this.repository.load(sessionId),
    ]);
    return {snapshot:view.snapshot,...workspace};
  }
}
