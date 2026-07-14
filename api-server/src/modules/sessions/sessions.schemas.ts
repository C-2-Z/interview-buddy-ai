/** 面试记录模块：只读会话路由的输入校验。 */
import { z } from "zod";

/** 单场面试路径参数，阻止无效 ID 进入数据库查询。 */
export const SessionParamsSchema = z.object({
  id: z.string().uuid(),
});
