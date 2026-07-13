# Git Push Script
# 在 AI 窗口内的 PowerShell 终端运行
# 注意：如果提示 "fatal: could not lock config file" 请关闭其他终端再试

Write-Host '=== Step 1: 创建 feature 分支 ===' -ForegroundColor Cyan
git checkout -b codex/knowledge-base-improvement 2>
if ($LASTEXITCODE -ne 0) {
    git checkout codex/knowledge-base-improvement
}

Write-Host '=== Step 2: 暂存改动 ===' -ForegroundColor Cyan
git add api-server/src/app.ts
git add api-server/src/modules/knowledge/
git add src/features/knowledge/
git add src/routes/_authenticated/knowledge.tsx
git add src/features/app-shell/constants.ts
git add src/features/app-shell/types.ts
git add src/routeTree.gen.ts
git add src/shared/api/http-client.ts
git add supabase/migrations/
git add docs/knowledge-base-improvement.md

Write-Host '=== Step 3: 提交 ===' -ForegroundColor Cyan
git commit -m 'feat(knowledge): Phase 1-4 knowledge base module refactor

- Processor Registry: extensible file parser (txt/pdf/docx/md)
- Configurable Splitter: three strategies (recursive/sentence/sliding_window)
- RAG Prompts: templated prompts with variable injection
- Brain concept: knowledge base CRUD + document association
- Query Rewrite: rewrite questions based on history
- Context Compression: filter + truncate search results'
if ($LASTEXITCODE -ne 0) {
    Write-Host '提交失败，请检查是否有冲突' -ForegroundColor Red
    exit 1
}

Write-Host '=== Step 4: 推送到 GitHub ===' -ForegroundColor Cyan
git push --set-upstream origin codex/knowledge-base-improvement

Write-Host '=== Step 5: 推送到 GitLab ===' -ForegroundColor Cyan
git push --set-upstream gitlab codex/knowledge-base-improvement

Write-Host '=== Step 6: 合并到 main ===' -ForegroundColor Cyan
git checkout main
git merge codex/knowledge-base-improvement

Write-Host '=== Step 7: 推送 main 到 GitHub ===' -ForegroundColor Cyan
git push origin main

Write-Host '=== Step 8: 推送 main 到 GitLab ===' -ForegroundColor Cyan
git push gitlab main

Write-Host '=== Step 9: 清理 feature 分支 ===' -ForegroundColor Cyan
git branch -d codex/knowledge-base-improvement
git push origin --delete codex/knowledge-base-improvement
git push gitlab --delete codex/knowledge-base-improvement

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host ' 全部完成！' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
