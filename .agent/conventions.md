# EZMock 开发约定 (.agent)

## 模块化规范
- 每个新功能必须是一个独立模块
- 后端: api-server/src/modules/<feature>/ 下 routes + service + repository + schemas
- 前端: src/features/<feature>/ 下 api.ts + types.ts + hooks/ + components/
- 禁止将多功能逻辑混入同一个文件

## 代码风格
- TypeScript 严格模式
- 使用 Zod 进行运行时校验
- 所有文件使用 2 空格缩进
- 函数命名: camelCase
- 类型命名: PascalCase
- 文件名: kebab-case

## 数据命名约定
| 位置 | 命名 |
|------|------|
| 数据库字段 | snake_case |
| API 请求体 | camelCase |
| UI 文案 | 中文 |

## Git 提交规范
- 格式: <type>(<scope>): <中文描述>
- 类型: feat / fix / refactor / docs / db / config
- 一行不超过 72 字
- 一个提交只做一件事
- 推送到远程前确保 npm run build 通过

## 开发流程
1. 新增功能: 先建后端模块 (routes/service/repository/schemas)
2. 再建前端 feature 目录 (api/types/hooks/components)
3. 在 app.ts 注册后端路由
4. 在 src/routes/ 新增前端路由文件
5. 运行 npm run dev 自动生成 routeTree.gen.ts

## AI 禁飞区提醒
以下 3 个核心功能必须手写，不能依赖 AI 生成:
1. 面试问题生成的难度递进策略
2. 评分的多维度加权计算
3. 弱项分析的聚合逻辑