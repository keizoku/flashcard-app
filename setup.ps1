# フラッシュカードアプリのセットアップ（Windows 用）
#   使い方: setup.cmd をダブルクリック、または PowerShell で
#           powershell -ExecutionPolicy Bypass -File .\setup.ps1 [-SkipTests]
# 何度実行しても大丈夫（DB のデータは消さない）。説明書: docs/setup.md
# ※ 日本語を正しく読ませるため、このファイルは「UTF-8（BOM 付き）」で保存する

param([switch]$SkipTests)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppUrl = "http://localhost:3000"
$Ports = @(3000, 5432, 8025, 3100)   # アプリ / DB / 開発用の受信箱 / テスト実行ツール（compose.yaml と合わせる）
$WaitSeconds = 300             # 初回はビルドと画面の準備に時間がかかる

function Step($text) { Write-Host ""; Write-Host "▶ $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  ✓ $text" -ForegroundColor Green }
function Fail($text, [string[]]$hints = @()) {
  Write-Host "  ✗ $text" -ForegroundColor Red
  foreach ($h in $hints) { Write-Host "    $h" }
  exit 1
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
# 外部のコマンドを動かし、成功したか（終了コードが 0 か）を返す。出力は捨てる
function Succeeds([scriptblock]$block) {
  $ErrorActionPreference = "Continue"
  & $block *> $null
  return ($LASTEXITCODE -eq 0)
}
function PortInUse($port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync("127.0.0.1", $port)
    return ($task.Wait(500) -and $client.Connected)
  } catch { return $false } finally { $client.Dispose() }
}
function AppIsUp {
  try {
    $r = Invoke-WebRequest -Uri "$AppUrl/login" -UseBasicParsing -TimeoutSec 5
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

# ---- 1. 必要なソフト ----------------------------------------------------------
Step "必要なソフトを確かめます"
if (-not (Has git)) { Fail "git がありません" @("Git for Windows を入れてください https://git-scm.com/download/win") }
Ok "git"
if (-not (Has docker)) {
  Fail "Docker がありません" @("Docker Desktop を入れてください https://www.docker.com/products/docker-desktop/",
    "入れたあと、PowerShell を開き直してから、もう一度実行してください")
}
if (-not (Succeeds { docker compose version })) { Fail "docker compose が使えません" @("Docker Desktop を新しいものにしてください") }
Ok "docker compose"
if (-not (Succeeds { docker info })) {
  Fail "Docker が動いていません" @("Docker Desktop を起動して、「Engine running」になるまで待ってから、もう一度実行してください")
}
Ok "Docker が動いている"

# ---- 2. git の設定 ------------------------------------------------------------
Step "コミットの前にテストが走るようにします"
if (Succeeds { git rev-parse --is-inside-work-tree }) {
  git config core.hooksPath .githooks
  Ok "git config core.hooksPath .githooks"
} else {
  Write-Host "  （git のリポジトリではないので飛ばします）"
}

# ---- 3. ポート ----------------------------------------------------------------
Step "ポートが空いているか確かめます"
$running = & { $ErrorActionPreference = "Continue"; docker compose ps -q 2>$null }
if ($running) {
  Ok "すでにこのアプリが動いています（ポートの確認は飛ばして、更新します）"
} else {
  $busy = @($Ports | Where-Object { PortInUse $_ })
  if ($busy.Count -gt 0) {
    Fail "使われているポートがあります: $($busy -join ', ')" @(
      "ほかのアプリ（別の PostgreSQL など）を止めてから、もう一度実行してください。",
      "何が使っているかは: Get-NetTCPConnection -State Listen -LocalPort $($busy[0]) | Select OwningProcess")
  }
  Ok "$($Ports -join ' ') は空いている"
}

# ---- 4. 起動 ------------------------------------------------------------------
Step "起動します（初回はビルドするので数分かかります）"
& { $ErrorActionPreference = "Continue"; docker compose up -d --build }
if ($LASTEXITCODE -ne 0) { Fail "起動できませんでした" @("上のメッセージを確かめてください") }
Ok "コンテナを起動した"

Write-Host -NoNewline "  画面が開けるようになるのを待っています"
$up = $false
for ($i = 0; $i -lt $WaitSeconds; $i += 3) {
  if (AppIsUp) { $up = $true; break }
  Write-Host -NoNewline "."
  Start-Sleep -Seconds 3
}
Write-Host ""
if (-not $up) { Fail "$WaitSeconds 秒待っても画面が開けません" @("ログを見てください: docker compose logs app") }
Ok "$AppUrl が開ける"

# ---- 5. 単体テスト ------------------------------------------------------------
if ($SkipTests) {
  Step "単体テストは飛ばします（-SkipTests）"
} else {
  Step "単体テストで、正しく動くか確かめます（テスト用の DB を使うので、データには触れません）"
  $log = Join-Path $env:TEMP "flashcard-setup-test.log"
  & { $ErrorActionPreference = "Continue"; docker compose exec -T -e NO_COLOR=1 app npm test *> $log }
  if ($LASTEXITCODE -eq 0) {
    $summary = Select-String -Path $log -Pattern "Tests\s+\d+ passed" | Select-Object -First 1
    Ok ($(if ($summary) { $summary.Line.Trim() -replace "\s+", " " } else { "すべて通った" }))
    Remove-Item $log -ErrorAction SilentlyContinue
  } else {
    Get-Content $log -Tail 30
    Fail "単体テストが失敗しました" @("全部のログ: $log")
  }
}

# ---- 6. 案内 ------------------------------------------------------------------
Write-Host ""
Write-Host "セットアップが終わりました" -ForegroundColor Green
Write-Host ""
Write-Host "  1. $AppUrl/signup でメールアドレスとパスワード（8文字以上）を入れて登録"
Write-Host "  2. 開発用の受信箱 http://localhost:8025 に届くメールのリンクを開くと、登録が完了します"
Write-Host ""
Write-Host "  止める:   docker compose down（データは残ります）"
Write-Host "  また使う: docker compose up -d（または、もう一度 setup.cmd）"
