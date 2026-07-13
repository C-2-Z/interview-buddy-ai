/** Agent 创建失败恢复协议的稳定映射单元测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import {ApiRequestError} from "@/shared/api/http-client";
import {normalizeAgentCreateFailure} from "./api";

test("retryable infrastructure errors preserve draft and allow inline retry",()=>{const failure=normalizeAgentCreateFailure(new ApiRequestError("internal",503,"agent_repository_unavailable",true));assert.deepEqual(failure,{code:"agent_repository_unavailable",message:"创建没有完成，已填写内容仍然保留，可以原地重试。",retryable:true,action:"retry_create"});});
test("disabled Agent maps to administrator action without raw backend text",()=>{const failure=normalizeAgentCreateFailure(new ApiRequestError("New Agent interviews are currently disabled.",503,"agent_interview_disabled",false));assert.equal(failure.action,"contact_admin");assert.equal(failure.message.includes("New Agent"),false);});
test("unknown exceptions remain safe and retryable",()=>{const failure=normalizeAgentCreateFailure(new Error("database password leaked"));assert.equal(failure.code,"create_unknown_error");assert.equal(failure.retryable,true);assert.equal(JSON.stringify(failure).includes("password"),false);});
