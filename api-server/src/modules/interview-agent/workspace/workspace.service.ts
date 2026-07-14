/** Agent 工作台 Service：把最新事件快照与只读业务投影合并。 */
import type { InterviewAgentService } from "../interview-agent.service.js";
import type { AgentWorkspaceRepository } from "./workspace.repository.js";
import type { AgentWorkspace } from "./workspace.types.js";
import type { AgentOrchestrationRepository } from "../../agent-orchestration/agent-orchestration.repository.js";

/** 页面恢复业务服务。 */
export class AgentWorkspaceService {
  /** @param agentService - 快照真相源。 @param repository - 业务投影真相源。 */
  constructor(
    private readonly agentService: Pick<InterviewAgentService,"getSession">,
    private readonly repository: Pick<AgentWorkspaceRepository, "load">,
    private readonly orchestrationRepository?: AgentOrchestrationRepository,
  ) {}

  /** 加载同一用户拥有的完整 Agent 工作台。 */
  async load(sessionId:string):Promise<AgentWorkspace>{
    const [view,workspace]=await Promise.all([
      this.agentService.getSession(sessionId),
      this.repository.load(sessionId),
    ]);
    // v1 部署不要求存在 v2 增量表，必须完全跳过策略与活动查询以保持旧会话可用。
    if (view.snapshot.version === "agent-v1" || !this.orchestrationRepository) {
      return {snapshot:view.snapshot,...workspace,strategy:null,activities:[]};
    }
    const [strategy,activities]=await Promise.all([
      this.orchestrationRepository.getLatestStrategy(sessionId),
      this.orchestrationRepository.listActivities(sessionId),
    ]);
    return {snapshot:view.snapshot,...workspace,strategy,activities};
  }
}
