/** Agent 历史只读 API。 */
import {apiRequest} from "@/shared/api/http-client";
import type {InterviewHistoryItem} from "./types";

/** 列出当前用户的 Agent 会话。 */
export function listInterviewHistory():Promise<InterviewHistoryItem[]>{return apiRequest("GET","/api/sessions");}
