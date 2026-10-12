#requires -version 5.1
<#
  基础计算训练系统 · 启动脚本
  ---------------------------------------------------------------
  一般由项目根目录的「启动.bat」双击调用，也可以在终端里直接运行：

    powershell -NoProfile -ExecutionPolicy Bypass -File .tools\start.ps1 dev
    powershell -NoProfile -ExecutionPolicy Bypass -File .tools\start.ps1 preview
    powershell -NoProfile -ExecutionPolicy Bypass -File .tools\start.ps1 build
    powershell -NoProfile -ExecutionPolicy Bypass -File .tools\start.ps1 test
    powershell -NoProfile -ExecutionPolicy Bypass -File .tools\start.ps1 check

  参数：
    -Mode      dev | build | preview | test | check（默认 dev）
    -NoOpen    启动 dev / preview 时不自动打开浏览器

  注意：本文件必须以「UTF-8 带 BOM」保存，否则 Windows PowerShell 5.1
        会把中文按 GBK 解析而显示乱码。
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Mode = 'dev',
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

function Write-Title {
  Write-Host ''
  Write-Host '============================================' -ForegroundColor Green
  Write-Host '   基础计算训练系统 · 一键启动器' -ForegroundColor Green
  Write-Host '============================================' -ForegroundColor Green
  Write-Host ''
}

function Stop-WithError {
  param([string]$Text)
  Write-Host ''
  Write-Host "[失败] $Text" -ForegroundColor Red
  exit 1
}

# 通过 cmd 执行 npm 命令：参数原样传递，不受 PowerShell 版本对 “--” 的处理差异影响
function Invoke-NpmLine {
  param([string]$Line)
  & cmd.exe /c $Line
  return $LASTEXITCODE
}

# ---- 定位项目根目录 ----
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'package.json'))) { $root = (Get-Location).Path }
Set-Location $root

Write-Title

# ---- 1. 运行环境检查 ----
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithError '没有检测到 Node.js。请先安装 Node.js 20.19 或更高版本：https://nodejs.org/'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Stop-WithError '没有检测到 npm。请重新安装 Node.js（安装包会自带 npm）。'
}

$nodeVersion = (& node -v).Trim()
Write-Host "[环境] Node.js $nodeVersion" -ForegroundColor DarkGray
try {
  $parts = ($nodeVersion -replace '^v', '').Split('.')
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  if ($major -lt 20 -or ($major -eq 20 -and $minor -lt 19)) {
    Write-Host "[警告] 项目要求 Node.js >= 20.19，当前为 $nodeVersion，可能出现异常。" -ForegroundColor Yellow
  }
} catch {
  # 版本号解析失败不影响启动
}

# ---- 2. 依赖检查 ----
if (-not (Test-Path (Join-Path $root 'node_modules\vite\package.json'))) {
  Write-Host '[初始化] 首次运行，正在安装依赖，可能需要几分钟...' -ForegroundColor Cyan
  $code = Invoke-NpmLine 'npm install'
  if ($code -ne 0) {
    Write-Host '[重试] 系统 npm 缓存目录不可写，改用项目内缓存目录 .npm-cache' -ForegroundColor Yellow
    $code = Invoke-NpmLine 'npm install --cache ./.npm-cache'
    if ($code -ne 0) { Stop-WithError '依赖安装失败，请检查网络或 npm 配置。' }
  }
  Write-Host '[初始化] 依赖安装完成。' -ForegroundColor Green
  Write-Host ''
}

# ---- 3. 解析模式 ----
$mode = "$Mode".Trim().ToLower()
if ([string]::IsNullOrWhiteSpace($mode)) { $mode = 'dev' }
if (@('dev', 'build', 'preview', 'test', 'check') -notcontains $mode) {
  Write-Host "[提示] 未识别的参数「$Mode」，按默认的开发模式启动。" -ForegroundColor Yellow
  $mode = 'dev'
}

switch ($mode) {

  'check' {
    $distOk = Test-Path (Join-Path $root 'dist\index.html')
    $portBusy = $false
    try {
      $portBusy = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
    } catch { }

    Write-Host '[环境检查]' -ForegroundColor Cyan
    Write-Host "  项目目录 ：$root"
    Write-Host "  Node.js  ：$nodeVersion"
    Write-Host '  npm      ：已就绪'
    Write-Host '  依赖     ：已安装'
    if ($distOk) { Write-Host '  构建产物 ：存在（dist）' } else { Write-Host '  构建产物 ：未构建，可运行「启动.bat build」' }
    if ($portBusy) {
      Write-Host '  端口 5173：已被占用（可能有开发服务器正在运行）' -ForegroundColor Yellow
    } else {
      Write-Host '  端口 5173：空闲'
    }
    Write-Host ''
    Write-Host '用法：启动.bat [ dev / build / preview / test / check ]' -ForegroundColor DarkGray
    exit 0
  }

  'build' {
    Write-Host '[构建] 类型检查 + 生产构建...' -ForegroundColor Cyan
    Write-Host ''
    $code = Invoke-NpmLine 'npm run build'
    if ($code -ne 0) { Stop-WithError '构建失败，请查看上方输出。' }
    Write-Host ''
    Write-Host '[完成] 构建产物在 dist 目录，可直接部署或安装为 PWA。' -ForegroundColor Green
    exit 0
  }

  'preview' {
    if (-not (Test-Path (Join-Path $root 'dist\index.html'))) {
      Write-Host '[构建] 未找到 dist 产物，先执行生产构建...' -ForegroundColor Cyan
      $code = Invoke-NpmLine 'npm run build'
      if ($code -ne 0) { Stop-WithError '构建失败，无法启动预览。' }
    }
    Write-Host '[预览模式] 正在启动生产构建预览（更接近真机 / PWA 效果）' -ForegroundColor Cyan
    Write-Host '  地址：http://localhost:4173'
    Write-Host '  停止：在本窗口按 Ctrl + C'
    Write-Host ''
    if ($NoOpen) { $code = Invoke-NpmLine 'npm run preview' }
    else { $code = Invoke-NpmLine 'npm run preview -- --open' }
    Write-Host ''
    if ($code -ne 0) { Stop-WithError '预览已退出（返回码非 0）。' }
    Write-Host '[已停止] 预览服务已关闭。' -ForegroundColor DarkGray
    exit 0
  }

  'test' {
    Write-Host '[测试] 运行单元测试（Vitest）...' -ForegroundColor Cyan
    Write-Host ''
    $code = Invoke-NpmLine 'npm test'
    if ($code -ne 0) { Stop-WithError '测试未全部通过，请查看上方输出。' }
    Write-Host ''
    Write-Host '[完成] 全部测试通过。' -ForegroundColor Green
    exit 0
  }

  default {
    Write-Host '[开发模式] 正在启动 Vite 开发服务器（保存即热更新）' -ForegroundColor Cyan
    Write-Host '  地址：http://localhost:5173'
    Write-Host '  停止：在本窗口按 Ctrl + C'
    Write-Host ''
    if ($NoOpen) { $code = Invoke-NpmLine 'npm run dev' }
    else { $code = Invoke-NpmLine 'npm run dev -- --open' }
    Write-Host ''
    if ($code -ne 0) { Stop-WithError '开发服务器已退出（返回码非 0）。' }
    Write-Host '[已停止] 开发服务器已关闭。' -ForegroundColor DarkGray
    exit 0
  }
}
