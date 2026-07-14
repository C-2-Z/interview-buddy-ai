/** Native 客户端产物检查：验证 SPA 入口存在且不包含服务端秘密变量名称。 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const clientDirectory = path.resolve("dist-native/client");
const entryFile = path.join(clientDirectory, "index.html");
const forbiddenMarkers = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ENCRYPTION_KEY",
  "VOICE_WS_TOKEN_SECRET",
  "AI_BAILIAN_API_KEY",
  "DATABASE_URL",
  "TAVILY_API_KEY",
];

/**
 * 递归收集静态客户端中的文本产物，避免扫描 Native 构建使用的服务端辅助目录。
 *
 * @param directory - 当前遍历目录。
 * @returns 所有普通文件的绝对路径。
 */
async function listFiles(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry);
    const metadata = await stat(absolutePath);
    if (metadata.isDirectory()) files.push(...(await listFiles(absolutePath)));
    else files.push(absolutePath);
  }
  return files;
}

await stat(entryFile).catch(() => {
  throw new Error("Native 构建缺少 dist-native/client/index.html");
});

for (const file of await listFiles(clientDirectory)) {
  if (!/\.(?:html|js|css|json|map)$/i.test(file)) continue;
  const content = await readFile(file, "utf8");
  const leakedName = forbiddenMarkers.find((marker) => content.includes(marker));
  if (leakedName) throw new Error(`Native 客户端包含服务端变量名称 ${leakedName}`);
}

process.stdout.write("Native client entry and server-secret boundary verified.\n");
