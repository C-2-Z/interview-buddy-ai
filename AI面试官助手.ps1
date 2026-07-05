<#
.SYNOPSIS
  AI面试官助手 - 一键启动脚本
.DESCRIPTION
  自动检测端口 -> 启动前端+后端 -> 就绪后打开浏览器
  项目: AI 面试模拟器 (TanStack Start + Supabase + DeepSeek)

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
Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   AI面试官助手 - 启动中..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "项目目录: " -NoNewline
Write-Host $projectDir -ForegroundColor White

# ============================================================
# 1. 检测可用端口 (从 5173 开始往后找)
# ============================================================
function Get-AvailablePort {
    param([int]$startPort = 5173, [int]$maxPort = 5200)
    for ($port = $startPort; $port -le $maxPort; $port++) {
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
            $listener.Start()
            $listener.Stop()
            return $port
        } catch { }
    }
    return $startPort
}

$port = Get-AvailablePort
$url = "http://localhost:$port"
Write-Host "使用端口: " -NoNewline
Write-Host $port -ForegroundColor Green

# ============================================================
# 2. 检查依赖
# ============================================================
if (-not (Test-Path "node_modules")) {
    Write-Host "正在安装依赖..." -ForegroundColor Yellow
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "依赖安装失败, 请检查 npm 是否可用" -ForegroundColor Red
        Read-Host "按 Enter 退出"
        exit 1
    }
    Write-Host "依赖安装完成" -ForegroundColor Green
}

# ============================================================
# 3. 启动项目 (新建窗口运行 npm run dev)
#    npm run dev 同时启动:
#     - Vite 开发服务器 (前端热更新)
#     - Nitro SSR 服务器 (后端API)
# ============================================================
Write-Host "正在启动服务..." -ForegroundColor Cyan

$cmdArgs = @("/c", "title AI面试官助手 - 开发服务器 && cd /d $projectDir && npm run dev -- --port $port")
$viteProcess = Start-Process -PassThru -WindowStyle Normal -FilePath "cmd.exe" -ArgumentList $cmdArgs

# ============================================================
# 4. 等待服务就绪 (轮询本地端口)
# ============================================================
Write-Host "等待服务启动..." -ForegroundColor Yellow
$ready = $false
$timeout = 30
$elapsed = 0
while ((-not $ready) -and ($elapsed -lt $timeout)) {
    Start-Sleep 2
    $elapsed += 2
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) { $ready = $true }
    } catch { }
}

# ============================================================
# 5. 打开浏览器
# ============================================================
if ($ready) {
    Write-Host "服务已就绪! 正在打开浏览器..." -ForegroundColor Green
    Start-Process $url
} else {
    Write-Host "服务启动超时, 请手动打开浏览器访问: " -NoNewline -ForegroundColor Yellow
    Write-Host $url -ForegroundColor White
}

# ============================================================
# 6. 保持运行, 等待用户关闭
# ============================================================
Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   AI面试官助手 已启动" -ForegroundColor Green
Write-Host "   访问地址: " -NoNewline
Write-Host $url -ForegroundColor White
Write-Host "   停止服务: 关闭此窗口 或 按 Enter 键" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "按 Enter 停止服务"

# ============================================================
# 7. 清理
# ============================================================
Write-Host "正在停止服务..." -ForegroundColor Yellow
if ((-not $viteProcess.HasExited)) {
    $viteProcess.Kill()
    $viteProcess.Dispose()
}
Write-Host "AI面试官助手 已停止" -ForegroundColor Green
