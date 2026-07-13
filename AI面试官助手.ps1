<#
.SYNOPSIS
  AI面试官助手 - 一键启动脚本 (前后端分离版)
.DESCRIPTION
  自动检测端口 -> 启动 API 服务 + 前端 -> 就绪后打开浏览器
  项目: AI 面试模拟器 (TanStack Start + Hono API + Supabase + DeepSeek)

  使用方法:
  方法1) 右键 -> "使用 PowerShell 运行"
  方法2) 在终端执行: powershell -ExecutionPolicy Bypass -File .\AI面试官助手.ps1

  停止服务: 按 Ctrl+C 或 按 Enter 键
#>

# ============================================================
# 0. 切换到脚本所在目录
# ============================================================
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $projectDir

$script:processes = @()

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   AI面试官助手 v2 - 启动中..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "项目目录: $projectDir" -ForegroundColor White

# ============================================================
# 1. 检测可用端口
# ============================================================
function Test-PortAvailable {
    param([int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

$frontendPort = 3000
$apiPort = 3001

while (-not (Test-PortAvailable $frontendPort) -and $frontendPort -lt 3100) { $frontendPort++ }
while (-not (Test-PortAvailable $apiPort) -and $apiPort -lt 3100) { $apiPort++ }

$frontendUrl = "http://localhost:$frontendPort"
$apiUrl = "http://localhost:$apiPort"

Write-Host "前端地址: $frontendUrl" -ForegroundColor Green
Write-Host "API 地址: $apiUrl" -ForegroundColor Green

# ============================================================
# 2. 检查依赖
# ============================================================
Write-Host ""
Write-Host "正在检查依赖..." -ForegroundColor Cyan

if (-not (Test-Path "$projectDir\node_modules")) {
    Write-Host "安装前端依赖..." -ForegroundColor Yellow
    & cmd /c "cd /d $projectDir && npm install"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "前端依赖安装失败，请检查 npm 是否可用" -ForegroundColor Red
        Read-Host "按 Enter 退出"
        exit 1
    }
    Write-Host "前端依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "前端依赖已就绪" -ForegroundColor Green
}

$apiModules = "$projectDir\api-server\node_modules"
if (-not (Test-Path $apiModules)) {
    Write-Host "安装 API 服务依赖..." -ForegroundColor Yellow
    & cmd /c "cd /d $projectDir\api-server && npm install"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "API 服务依赖安装失败" -ForegroundColor Red
        Read-Host "按 Enter 退出"
        exit 1
    }
    Write-Host "API 服务依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "API 服务依赖已就绪" -ForegroundColor Green
}

# ============================================================
# 3. 准备可持久恢复的本地 PostgreSQL
# ============================================================
Write-Host ""
Write-Host "正在准备持久化面试恢复服务..." -ForegroundColor Cyan

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$projectDir\scripts\ensure-local-postgres.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "本地 PostgreSQL 初始化失败，无法安全启动 Agent 面试" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
}

# ============================================================
# 4. 启动 API 服务
# ============================================================
Write-Host ""
Write-Host "启动 API 服务..." -ForegroundColor Cyan

$apiProcess = Start-Process -PassThru -WindowStyle Normal -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$env:PORT='$apiPort'; Set-Location '$projectDir\api-server'; npx tsx src/serve.ts"
)
$script:processes += $apiProcess
Write-Host "API 服务 PID: $($apiProcess.Id)" -ForegroundColor White

# ============================================================
# 5. 启动前端
# ============================================================
Write-Host "启动前端开发服务器..." -ForegroundColor Cyan

$frontendProcess = Start-Process -PassThru -WindowStyle Normal -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$projectDir'; npm run dev -- --port $frontendPort"
)
$script:processes += $frontendProcess
Write-Host "前端开发服务器 PID: $($frontendProcess.Id)" -ForegroundColor White

# ============================================================
# 6. 等待服务就绪
# ============================================================
Write-Host ""
Write-Host "等待服务启动..." -ForegroundColor Yellow

$startTime = Get-Date
$timeoutSec = 60
$apiReady = $false
$frontendReady = $false

while ((-not $apiReady -or -not $frontendReady) -and ((Get-Date) - $startTime).TotalSeconds -lt $timeoutSec) {
    if (-not $apiReady) {
        try {
            $r = Invoke-WebRequest -Uri "$apiUrl/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { $apiReady = $true; Write-Host "API 服务就绪!" -ForegroundColor Green }
        } catch { }
    }
    if (-not $frontendReady) {
        try {
            $r = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { $frontendReady = $true; Write-Host "前端服务就绪!" -ForegroundColor Green }
        } catch { }
    }
    if (-not $apiReady -or -not $frontendReady) { Start-Sleep 2 }
}

# ============================================================
# 7. 打开浏览器
# ============================================================
if ($frontendReady) {
    Write-Host "正在打开浏览器..." -ForegroundColor Green
    Start-Process $frontendUrl
} else {
    Write-Host "前端服务启动超时，请手动打开: $frontendUrl" -ForegroundColor Yellow
    if (-not $apiReady) { Write-Host "API 服务也未就绪，请检查终端窗口" -ForegroundColor Red }
}

# ============================================================
# 8. 保持运行
# ============================================================
Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   AI面试官助手 v2 已启动" -ForegroundColor Green
Write-Host "   前端地址: " -NoNewline
Write-Host $frontendUrl -ForegroundColor White
Write-Host "   API 地址: " -NoNewline
Write-Host $apiUrl -ForegroundColor White
Write-Host "   停止服务: 关闭此窗口 或 按 Enter 键" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "按 Enter 停止服务"

# ============================================================
# 9. 清理子进程
# ============================================================
Write-Host "正在停止服务..." -ForegroundColor Yellow

foreach ($proc in $script:processes) {
    if ($proc -and (-not $proc.HasExited)) {
        try { $proc.CloseMainWindow() | Out-Null; Start-Sleep 1; if (-not $proc.HasExited) { $proc.Kill() } } catch { }
        $proc.Dispose()
    }
}

# 额外清理：残留的 tsx/vite 进程
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "tsx.*serve" -or $_.CommandLine -match "vite" } | ForEach-Object { try { $_.Kill() } catch { } }

Write-Host "AI面试官助手 已停止" -ForegroundColor Green
Read-Host "按 Enter 退出"
