# Terminaldan botni boshqarish: bot.cmd start | stop | restart | status | toggle
param(
  [ValidateSet("start", "stop", "restart", "status", "toggle")]
  [string]$Action = "toggle"
)

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$watchScript = Join-Path $dir "start-bot.ps1"
$watchPattern = [regex]::Escape('-File "' + $watchScript + '"')

function Get-BotProcesses {
  Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'index\.js') -or
    ($_.Name -eq 'powershell.exe' -and $_.CommandLine -match $watchPattern -and $_.ProcessId -ne $PID)
  }
}

function Start-Bot {
  if (Get-BotProcesses) {
    Write-Host "Bot allaqachon ishlab turibdi ✅"
    return
  }
  $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $watchScript
  Start-Process -FilePath "powershell.exe" -ArgumentList $argLine -WindowStyle Hidden
  Write-Host "Bot YOQILDI ✅  (Telegram'da /start bosing)"
}

function Stop-Bot {
  $procs = Get-BotProcesses
  if (-not $procs) {
    Write-Host "Bot allaqachon o'chgan ⏹"
    return
  }
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Bot O'CHIRILDI 🛑"
}

switch ($Action) {
  "start"   { Start-Bot }
  "stop"    { Stop-Bot }
  "restart" { Stop-Bot; Start-Sleep -Seconds 2; Start-Bot }
  "status"  {
    $procs = Get-BotProcesses
    if ($procs) {
      Write-Host "Bot ISHLAYAPTIRI ✅"
      $procs | Select-Object ProcessId, Name | Format-Table -AutoSize
    } else {
      Write-Host "Bot O'CHGAN 🛑"
    }
  }
  "toggle"  {
    if (Get-BotProcesses) { Stop-Bot } else { Start-Bot }
  }
}
