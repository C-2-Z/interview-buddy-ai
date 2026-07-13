/** Agent 历史列表类型。 */
export type InterviewHistoryItem={id:string;position:string;difficulty:string;status:string;overall_score:number|null;created_at:string;interview_mode:"text"|"voice";voice_mode?:boolean|null;agent_version:string|null};
/** 历史筛选。 */
export type InterviewHistoryFilters={query:string;mode:"all"|"text"|"voice";status:"all"|"active"|"completed";difficulty:"all"|"初级"|"中级"|"高级"};
/** 判断语音通道。 */
export function isVoiceSession(session:Pick<InterviewHistoryItem,"interview_mode"|"voice_mode">):boolean{return session.interview_mode==="voice"||session.voice_mode===true;}
