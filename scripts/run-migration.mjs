/** 通过 Supabase 管理 API 执行数据库迁移 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

// 从 .env 读取配置
const envPath = new URL("../.env", import.meta.url);
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").replace(/^"(.*)"$/, "$1").trim()];
    })
);

const SUPABASE_URL = envVars.SUPABASE_URL;
const SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = envVars.SUPABASE_PROJECT_ID;
const PAT = envVars.SUPABASE_PAT;

async function runMigration() {
  const sql = fs.readFileSync(
    new URL("../supabase/migrations/20260713000001_create_knowledge_base.sql", import.meta.url),
    "utf-8",
  );

  console.log(`Running migration (${sql.length} bytes)...`);

  // 方式1: 使用管理 API 执行 SQL
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      },
    );

    const result = await response.text();
    if (response.ok) {
      console.log("迁移成功完成！");
      console.log("响应:", result);
    } else {
      console.error("迁移失败:", response.status, result);
    }
  } catch (err) {
    console.error("迁移执行出错:", err.message);
    console.log("\n尝试方式2: 使用 service_role key...");

    // 方式2: 使用 service_role key 通过 SQL 查询端点
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      // 使用 rest 的 /rpc/exec_sql 或直接执行 SQL
      const response2 = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/`,
        {
          method: "POST",
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        },
      );
      const result2 = await response2.text();
      console.log("方式2响应:", response2.status, result2);
    } catch (err2) {
      console.error("方式2也失败:", err2.message);
      console.log("\n迁移文件内容已就绪，请手动在 Supabase Dashboard 的 SQL Editor 中执行：");
      console.log("https://supabase.com/dashboard/project/sgrwsljvglfuwgzbjkmo/sql");
    }
  }
}

runMigration();
