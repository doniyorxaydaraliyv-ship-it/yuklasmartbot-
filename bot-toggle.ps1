# Botni yoqib / o'chirib turuvchi skript
# Har safar ishga tushirilsa: ishlab turgan bo'lsa -> o'chiradi, o'chgan bo'lsa -> yoqadi

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$watchScript = Join-Path $dir "start-bot.ps1"

# Ishlab turgan bot va uning kuzatuvchisini aniq topamiz
# (boshqa jarayonlar tasodifan mos kelib qolmasligi uchun to'liq yo'l bo'yicha izlaymiz)
$watchPattern = [regex]::Escape('-File "' + $watchScript + '"')
$procs = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'index\.js') -or
  ($_.Name -eq 'powershell.exe' -and $_.CommandLine -match $watchPattern -and $_.ProcessId -ne $PID)
}

if ($procs) {
  # O'chiramiz
  foreach ($p in $procs) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Write-Host ""
  Write-Host "Bot O'CHIRILDI. (Qayta yoqish uchun skriptni yana ishga tushiring)" -ForegroundColor Yellow
  Write-Host ""
} else {
  # Yoqamiz — kuzatuvchi fonada ishga tushadi, bot ham ishga tushadi
  $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $watchScript
  Start-Process -FilePath "powershell.exe" -ArgumentList $argLine -WindowStyle Hidden
  Write-Host ""
  Write-Host "Bot YOQILDI. Telegram'da /start bosing." -ForegroundColor Green
  Write-Host ""
}

Start-Sleep -Seconds 2
Read-Host "Chiqish uchun Enter bosing"
