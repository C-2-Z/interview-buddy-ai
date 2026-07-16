/** profile：用户资料输入校验 */
import { z } from "zod";
export const UpdateProfileSchema = z.object({ displayName: z.string().trim().min(1, "昵称不能为空").max(30, "昵称最多 30 个字符") });
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
