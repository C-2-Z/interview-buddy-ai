/** Agent 工作台显式查询、映射和完成报告恢复测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {AgentWorkspaceRepository,type WorkspaceDatabaseClient,type WorkspaceQuery} from "./workspace.repository.js";

const SESSION_ID="11111111-1111-4111-8111-111111111111";const QUESTION_ID="22222222-2222-4222-8222-222222222222";

/** 为一个固定响应创建可链式 fake query。 */
function query(data:unknown):WorkspaceQuery{
  const response={data,error:null};
  const builder:WorkspaceQuery={select(){return builder;},eq(){return builder;},in(){return builder;},order(){return builder;},single(){return builder;},then(resolve,reject){return Promise.resolve(response).then(resolve,reject);}};
  return builder;
}

test("workspace restores grounded evidence, evaluation, research, and report",async()=>{
  const database:WorkspaceDatabaseClient={from(table){
    if(table==="interview_sessions")return query({position:"后端工程师",difficulty:"高级",research_status:"completed",agent_config:{questionCount:1,targetCompany:"示例公司"},overall_score:91,overall_feedback:"证据充分",dimension_summary:{overallScore:91},report_status:"ready"});
    if(table==="interview_questions")return query([{id:QUESTION_ID,question:"说明一次优化",order_index:0,role_id:"technical",dimension_key:"technical_depth",selection_source:"model",score:91,feedback:"清晰"}]);
    if(table==="interview_messages")return query([{id:"33333333-3333-4333-8333-333333333333",question_id:QUESTION_ID,role:"user",content:"P95 降到 120ms",source:"voice",interrupted:false,created_at:new Date(0).toISOString()}]);
    if(table==="agent_research_sources")return query([{id:"44444444-4444-4444-8444-444444444444",category:"company",title:"公司工程博客",url:"https://example.test"}]);
    if(table==="answer_evidence")return query([{id:"55555555-5555-4555-8555-555555555555",question_id:QUESTION_ID,dimension_key:"technical_depth",claim:"量化优化",quote:"P95 降到 120ms"}]);
    return query([{question_id:QUESTION_ID,overall_score:91,dimensions:{technical_depth:{score:91,rationale:"有量化证据",evidenceIds:["55555555-5555-4555-8555-555555555555"]}},status:"completed"}]);
  }};
  const workspace=await new AgentWorkspaceRepository(database).load(SESSION_ID);
  assert.equal(workspace.questions[0].messages[0].source,"voice");
  assert.equal(workspace.questions[0].evidence[0].quote,"P95 降到 120ms");
  assert.equal(workspace.questions[0].evaluation?.overallScore,91);
  assert.equal(workspace.research.sources[0].title,"公司工程博客");
  assert.equal(workspace.report?.overallScore,91);
});
