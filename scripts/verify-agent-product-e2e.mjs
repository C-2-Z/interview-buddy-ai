/** Agent 产品闭环 E2E：创建临时用户并验证 readiness、联网创建、生命周期、报告与删除。 */
import "../api-server/node_modules/dotenv/config.js";
import {randomBytes} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

const API_BASE=process.env.API_E2E_BASE_URL??"http://localhost:3001";

/** 读取必需环境变量，错误只包含变量名。 */
function required(name){const value=process.env[name]?.trim();if(!value)throw new Error(`Missing ${name}`);return value;}

/** 发起带用户令牌的 API 请求，并拒绝输出响应中的未知原始错误。 */
async function apiRequest(token,path,init={}){
  const response=await fetch(`${API_BASE}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(init.headers??{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`E2E request failed: ${path} (${response.status}, ${typeof body.code==="string"?body.code:"unknown"})`);
  return body;
}

/** 执行真实闭环并始终清理临时认证用户。 */
async function main(){
  const supabaseUrl=required("SUPABASE_URL");const publishableKey=required("SUPABASE_PUBLISHABLE_KEY");const serviceKey=required("SUPABASE_SERVICE_ROLE_KEY");
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=`codex-e2e-${Date.now()}@example.com`;const password=`E2e!${randomBytes(18).toString("base64url")}`;let userId=null;let sessionId=null;
  try{
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error||!created.data.user)throw new Error("Unable to create E2E user");userId=created.data.user.id;
    const client=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});const signedIn=await client.auth.signInWithPassword({email,password});if(signedIn.error||!signedIn.data.session)throw new Error("Unable to authenticate E2E user");const token=signedIn.data.session.access_token;
    const readiness=await apiRequest(token,"/api/agent/readiness?interviewMode=text&modelProvider=deepseek&webResearch=true");
    if(readiness.status==="blocked")throw new Error("Readiness unexpectedly blocked");
    const createdSession=await apiRequest(token,"/api/agent/sessions",{method:"POST",body:JSON.stringify({mode:"single",interviewMode:"text",position:"Java 后端工程师",difficulty:"中级",questionCount:3,targetCompany:"OpenAI",modelProvider:"deepseek",webResearch:true})});sessionId=createdSession.sessionId;
    const workspace=await apiRequest(token,`/api/agent/sessions/${sessionId}/workspace`);if(workspace.research.status!=="completed"||workspace.research.sources.length<1)throw new Error("Public web research did not return traceable sources");
    const paused=await apiRequest(token,`/api/agent/sessions/${sessionId}/lifecycle`,{method:"POST",body:JSON.stringify({action:"pause"})});if(paused.status!=="paused")throw new Error("Pause did not persist");
    const resumed=await apiRequest(token,`/api/agent/sessions/${sessionId}/lifecycle`,{method:"POST",body:JSON.stringify({action:"resume"})});if(resumed.status!=="in_progress")throw new Error("Resume did not persist");
    const finished=await apiRequest(token,`/api/agent/sessions/${sessionId}/lifecycle`,{method:"POST",body:JSON.stringify({action:"finish"})});if(finished.status!=="completed"||!finished.reportAvailable)throw new Error("Partial report was not finalized");
    const report=await apiRequest(token,`/api/agent/sessions/${sessionId}/workspace`);if(!report.report)throw new Error("Report deep-link projection is unavailable");
    const removed=await apiRequest(token,`/api/agent/sessions/${sessionId}`,{method:"DELETE"});if(!removed.deleted)throw new Error("Session deletion was not confirmed");sessionId=null;
    process.stdout.write(JSON.stringify({readiness:readiness.status,researchStatus:workspace.research.status,researchSourceCount:workspace.research.sources.length,pauseResume:true,partialReport:true,deleted:true})+"\n");
  }finally{
    // 删除临时认证用户会级联清理由失败断言留下的业务测试数据。
    if(userId)await admin.auth.admin.deleteUser(userId);
  }
}

await main();
