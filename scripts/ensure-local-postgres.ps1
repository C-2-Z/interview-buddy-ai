<# EZMock local durable PostgreSQL bootstrap for LangGraph checkpoints. #>
[CmdletBinding()]
param(
    [switch]$SkipCheckpointSetup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectDir ".runtime"
$postgresVersion = "17.10"
$postgresArchiveUrl = "https://get.enterprisedb.com/postgresql/postgresql-17.10-2-windows-x64-binaries.zip"
$postgresArchiveSha256 = "ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106"
$archivePath = Join-Path $runtimeDir "postgresql-$postgresVersion-windows-x64.zip"
$installDir = Join-Path $runtimeDir "postgresql-$postgresVersion"
$postgresRoot = Join-Path $installDir "pgsql"
$binDir = Join-Path $postgresRoot "bin"
$dataDir = Join-Path $runtimeDir "postgres-data"
$logPath = Join-Path $runtimeDir "postgres.log"
$passwordPath = Join-Path $runtimeDir "postgres.password"
$envPath = Join-Path $projectDir ".env"
$databasePort = 55432
$databaseUser = "ezmock"
$databaseName = "ezmock_agent"

<#
.SYNOPSIS
  Updates one root .env value without logging it or changing unrelated settings.
.PARAMETER Name
  Environment variable name to update.
.PARAMETER Value
  Value written only to the ignored local .env file.
#>
function Set-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $lines = if (Test-Path -LiteralPath $envPath) {
        @(Get-Content -LiteralPath $envPath -Encoding utf8)
    } else {
        @()
    }
    $replacement = "$Name=$Value"
    $matched = $false
    $nextLines = foreach ($line in $lines) {
        if ($line -match "^$([regex]::Escape($Name))=") {
            if (-not $matched) {
                $replacement
                $matched = $true
            }
        } else {
            $line
        }
    }
    if (-not $matched) {
        $nextLines += $replacement
    }
    Set-Content -LiteralPath $envPath -Value $nextLines -Encoding utf8
}

<#
.SYNOPSIS
  Downloads and extracts the official EDB portable PostgreSQL package.
#>
function Install-PortablePostgres {
    $postgresExecutable = Join-Path $binDir "postgres.exe"
    if (Test-Path -LiteralPath $postgresExecutable) {
        return
    }

    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    if (-not (Test-Path -LiteralPath $archivePath)) {
        $partialPath = "$archivePath.partial"
        Write-Host "First run: downloading portable PostgreSQL $postgresVersion (about 319 MB)..." -ForegroundColor Cyan
        & curl.exe --fail --location --output $partialPath $postgresArchiveUrl
        if ($LASTEXITCODE -ne 0) {
            throw "PostgreSQL download failed"
        }
        Move-Item -LiteralPath $partialPath -Destination $archivePath -Force
    }

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($archiveHash -ne $postgresArchiveSha256) {
        throw "PostgreSQL archive checksum verification failed"
    }

    Write-Host "Extracting the portable PostgreSQL runtime..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $installDir -Force
    if (-not (Test-Path -LiteralPath $postgresExecutable)) {
        throw "The PostgreSQL portable package is incomplete"
    }
}

<#
.SYNOPSIS
  Creates or reads the local database password stored only under ignored .runtime.
.OUTPUTS
  Random password used by the current local cluster.
#>
function Get-LocalDatabasePassword {
    if (Test-Path -LiteralPath $passwordPath) {
        return (Get-Content -LiteralPath $passwordPath -Raw -Encoding utf8).Trim()
    }

    $passwordBytes = New-Object byte[] 24
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($passwordBytes)
    } finally {
        $random.Dispose()
    }
    $password = ([BitConverter]::ToString($passwordBytes) -replace "-", "").ToLowerInvariant()
    Set-Content -LiteralPath $passwordPath -Value $password -Encoding utf8 -NoNewline
    return $password
}

<#
.SYNOPSIS
  Initializes a UTF-8 PostgreSQL cluster intended to listen only on localhost.
.PARAMETER Password
  Random password for the ezmock cluster administrator.
#>
function Initialize-DatabaseCluster {
    param([Parameter(Mandatory = $true)][string]$Password)

    if (Test-Path -LiteralPath (Join-Path $dataDir "PG_VERSION")) {
        return
    }

    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    $passwordFile = Join-Path $runtimeDir "initdb-password.tmp"
    try {
        Set-Content -LiteralPath $passwordFile -Value $Password -Encoding utf8 -NoNewline
        & (Join-Path $binDir "initdb.exe") `
            --pgdata=$dataDir `
            --username=$databaseUser `
            --pwfile=$passwordFile `
            --auth-host=scram-sha-256 `
            --auth-local=trust `
            --encoding=UTF8 `
            --locale=C
        if ($LASTEXITCODE -ne 0) {
            throw "PostgreSQL data directory initialization failed"
        }
    } finally {
        Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
    }
}

<#
.SYNOPSIS
  Checks whether PostgreSQL accepts connections on the fixed local port.
.OUTPUTS
  True when the database is ready.
#>
function Test-DatabaseReady {
    & (Join-Path $binDir "pg_isready.exe") `
        --host=127.0.0.1 `
        --port=$databasePort `
        --username=$databaseUser *> $null
    return $LASTEXITCODE -eq 0
}

<#
.SYNOPSIS
  Starts portable PostgreSQL on the fixed 127.0.0.1 endpoint.
#>
function Start-LocalDatabase {
    if (Test-DatabaseReady) {
        return
    }

    & (Join-Path $binDir "pg_ctl.exe") `
        --pgdata=$dataDir `
        --log=$logPath `
        --options="-p $databasePort -h 127.0.0.1" `
        start
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL failed to start; inspect .runtime/postgres.log"
    }

    foreach ($attempt in 1..20) {
        if (Test-DatabaseReady) {
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "PostgreSQL startup timed out; inspect .runtime/postgres.log"
}

<#
.SYNOPSIS
  Ensures the dedicated Agent checkpoint database exists without recreating it.
.PARAMETER Password
  Local database connection password.
#>
function Initialize-AgentDatabase {
    param([Parameter(Mandatory = $true)][string]$Password)

    $previousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Password
    try {
        $exists = & (Join-Path $binDir "psql.exe") `
            --host=127.0.0.1 `
            --port=$databasePort `
            --username=$databaseUser `
            --dbname=postgres `
            --tuples-only `
            --no-align `
            --command="select 1 from pg_database where datname = '$databaseName'"
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to inspect the local Agent database"
        }
        if (($exists | Out-String).Trim() -ne "1") {
            & (Join-Path $binDir "createdb.exe") `
                --host=127.0.0.1 `
                --port=$databasePort `
                --username=$databaseUser `
                $databaseName
            if ($LASTEXITCODE -ne 0) {
                throw "Unable to create the local Agent database"
            }
        }
    } finally {
        $env:PGPASSWORD = $previousPassword
    }
}

Install-PortablePostgres
$databasePassword = Get-LocalDatabasePassword
Initialize-DatabaseCluster -Password $databasePassword
Start-LocalDatabase
Initialize-AgentDatabase -Password $databasePassword

$escapedPassword = [Uri]::EscapeDataString($databasePassword)
$databaseUrl = "postgresql://${databaseUser}:${escapedPassword}@127.0.0.1:${databasePort}/${databaseName}?sslmode=disable"
Set-DotEnvValue -Name "DATABASE_URL" -Value $databaseUrl
Set-DotEnvValue -Name "AGENT_ALLOW_MEMORY_CHECKPOINTER" -Value "0"

if (-not $SkipCheckpointSetup) {
    Write-Host "Initializing durable Agent checkpoint tables..." -ForegroundColor Cyan
    Push-Location (Join-Path $projectDir "api-server")
    try {
        & npm run agent:checkpoint:setup
        if ($LASTEXITCODE -ne 0) {
            throw "Agent checkpoint table initialization failed"
        }
    } finally {
        Pop-Location
    }
}

Write-Host "Local PostgreSQL is ready; Agent interviews now survive API restarts." -ForegroundColor Green
