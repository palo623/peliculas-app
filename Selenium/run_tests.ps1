<# 
.SYNOPSIS
    Script PowerShell para ejecutar tests Selenium en Windows.

.DESCRIPTION
    Wrapper para run_tests.py con parámetros comunes predefinidos.

.EXAMPLE
    .\run_tests.ps1 -Mark smoke -Headless

.EXAMPLE
    .\run_tests.ps1 -Mark movies -Browser firefox -Verbose

.EXAMPLE
    .\run_tests.ps1 -Install -Mark auth
#>

param(
    [Parameter()]
    [ValidateSet("smoke", "regression", "auth", "movies", "admin", "marathons", "reviews", "navigation")]
    [string]$Mark,

    [Parameter()]
    [ValidateSet("chrome", "firefox", "edge")]
    [string]$Browser = "chrome",

    [switch]$Headless,

    [switch]$Verbose,

    [switch]$Html,

    [switch]$Junit,

    [switch]$Install,

    [string]$Keyword,

    [string[]]$ExtraArgs
)

$testsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $testsDir

# Instalar dependencias
if ($Install) {
    Write-Host "Instalando dependencias..." -ForegroundColor Cyan
    python -m pip install -r requirements.txt
}

# Variables de entorno
if ($Headless) { $env:HEADLESS = "true" }
$env:BROWSER = $Browser

# Construir comando
$cmd = @("python", "-m", "pytest")

if ($Verbose) { $cmd += "-v" }
if ($Mark) { $cmd += "-m", $Mark }
if ($Keyword) { $cmd += "-k", $Keyword }
if ($Html) { $cmd += "--html=reports/report.html", "--self-contained-html" }
if ($Junit) { $cmd += "--junitxml=reports/junit.xml" }
if ($ExtraArgs) { $cmd += $ExtraArgs }

Write-Host "Ejecutando: $($cmd -join ' ')" -ForegroundColor Green
Write-Host "Directorio: $testsDir" -ForegroundColor Gray

# Ejecutar
$exitCode = 0
try {
    & $cmd
    $exitCode = $LASTEXITCODE
} catch {
    Write-Error "Error ejecutando tests: $_"
    $exitCode = 1
}

if ($exitCode -eq 0) {
    Write-Host "`n✅ Tests completados exitosamente" -ForegroundColor Green
    if ($Html) { Write-Host "📊 Reporte: $testsDir\reports\report.html" -ForegroundColor Cyan }
} else {
    Write-Host "`n❌ Tests fallaron (código: $exitCode)" -ForegroundColor Red
}

exit $exitCode