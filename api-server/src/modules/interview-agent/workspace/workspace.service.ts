/** Agent 工作台 Service：提供单次恢复页面所需的安全只读投影。 */
import type { AgentWorkspaceRepository } from "./workspace.repository.js";
import type { AgentWorkspace } from "./workspace.types.js";

/** 页面恢复业务服务。 */
export class AgentWorkspaceService {
  /** @param repository - 已在数据库内校验会话所有权的投影 Repository。 */
  constructor(
    private readonly repository: Pick<AgentWorkspaceRepository, "load">,
  ) {}

  /**
   * 加载完整 Agent 工作台；Repository 以一次 RPC 返回一致水位的数据。
   *
   * @param sessionId - 当前用户拥有的 Agent 会话 UUID。
   * @returns 可直接交给前端恢复页面的完整投影。
   */
  async load(sessionId: string): Promise<AgentWorkspace> {
    return this.repository.load(sessionId);
  }
}
