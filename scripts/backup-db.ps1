<#
  本機備份 Supabase Postgres 到指定資料夾（例如 Google Drive 同步資料夾）。
  用 pg_dump 產生「可 pg_restore 完整還原」的備份，是本機 / git 以外的第三地備份。

  ── 每台電腦一次性設定（工作機、家裡各做一次）─────────────────────────────
  1. 裝 PostgreSQL 17（含 pg_dump）：https://www.postgresql.org/download/windows/
     裝完 pg_dump 預設在 C:\Program Files\PostgreSQL\17\bin\pg_dump.exe
  2. 設 user 環境變數 SUPABASE_DB_URL（PowerShell 跑一次，之後永久有效）：
       [Environment]::SetEnvironmentVariable(
         'SUPABASE_DB_URL',
         'postgresql://postgres:[密碼]@db.lveekehjxkfvigwfwgvn.supabase.co:5432/postgres',
         'User')
     連線字串從 Supabase Dashboard → Settings → Database → Connection string 複製，
     把 [YOUR-PASSWORD] 換成真正的資料庫密碼。（不寫進本檔，避免密碼進 git。）
  3. 確認你這台的 Google Drive 資料夾路徑，例如 G:\我的雲端硬碟\interview-backup
     兩台電腦的路徑可以不同，各自填各自的。

  ── 手動測試 ──────────────────────────────────────────────────────────────
    powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1 -OutDir "G:\我的雲端硬碟\interview-backup"

  ── 每天自動跑（Windows 工作排程器）─────────────────────────────────────────
    程式：powershell
    引數：-ExecutionPolicy Bypass -File "C:\...\scripts\backup-db.ps1" -OutDir "G:\我的雲端硬碟\interview-backup"
    觸發：每天一次（例如 02:00）；勾「不論使用者登入與否」與「喚醒電腦執行」。

  ── 還原（災難時）─────────────────────────────────────────────────────────
    pg_restore --clean --no-owner --no-privileges -d "postgresql://...:5432/postgres" db-backup-XXXX.dump
#>
param(
  [Parameter(Mandatory = $true)][string]$OutDir,   # 備份目的資料夾（指向你的 Google Drive 同步資料夾）
  [int]$KeepDays = 30,                              # 保留最近幾天，更舊的自動刪
  [string]$PgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
)

$ErrorActionPreference = 'Stop'

$dbUrl = $env:SUPABASE_DB_URL
if (-not $dbUrl)              { Write-Error "未設定環境變數 SUPABASE_DB_URL（見本檔頂部說明）"; exit 1 }
if (-not (Test-Path $PgDump)) { Write-Error "找不到 pg_dump：$PgDump（請確認 PostgreSQL 安裝路徑）"; exit 1 }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# 檔名帶「時間戳 + 電腦名」→ 兩台電腦寫同一個 Drive 資料夾也不會互相覆蓋。
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$pcName = $env:COMPUTERNAME
$file   = Join-Path $OutDir "db-backup-$stamp-$pcName.dump"

Write-Host "備份中 → $file"
& $PgDump $dbUrl --no-owner --no-privileges --format=custom --file=$file
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump 失敗（exit $LASTEXITCODE）"; exit $LASTEXITCODE }

$sizeMB = [math]::Round((Get-Item $file).Length / 1MB, 2)
Write-Host "完成：$file （$sizeMB MB）"

# 保留最近 N 天，刪更舊的。冪等：兩台電腦各跑結果一致，不會衝突。
Get-ChildItem $OutDir -Filter 'db-backup-*.dump' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  ForEach-Object { Write-Host "刪除逾期備份：$($_.Name)"; Remove-Item $_.FullName -Force }
