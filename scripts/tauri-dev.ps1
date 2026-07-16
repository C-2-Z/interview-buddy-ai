<#
.SYNOPSIS
  Tauri 开发/构建包装脚本。设置 Rust 工具链环境变量后调用 tauri CLI。
.DESCRIPTION
  Rust 工具链安装在 %TEMP%\.rustup 下（因沙箱权限限制），
  默认的 cargo 代理无法直接找到。此脚本正确设置 RUSTUP_HOME 后执行 tauri 命令。
.PARAMETER Command
  要执行的 tauri 子命令：dev / build / icon
.EXAMPLE
  .\scripts\tauri-dev.ps1 dev
  .\scripts\tauri-dev.ps1 build
#>

param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("dev", "build", "icon")]
  [string]$Command
)

$rustupHome = "$env:TEMP\.rustup"

if (-not (Test-Path $rustupHome)) {
  Write-Error "Rust 工具链目录不存在: $rustupHome"
  Write-Error "请运行: rustup default stable"
  exit 1
}

$env:RUSTUP_HOME = $rustupHome

$tauriPath = Join-Path $PSScriptRoot "..\node_modules\.bin\tauri.cmd"

if (-not (Test-Path $tauriPath)) {
  Write-Error "tauri CLI not found at $tauriPath"
  Write-Error "请运行: npm install --save-dev @tauri-apps/cli"
  exit 1
}

# 传递额外参数
$extraArgs = if ($args) { $args -join " " } else { "" }
& $tauriPath $Command $extraArgs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
