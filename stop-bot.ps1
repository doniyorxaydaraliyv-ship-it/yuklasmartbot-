# Botni va uning kuzatuvchisini to'xtatadi
Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*index.js*') -or
  ($_.CommandLine -like '*start-bot.ps1*')
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "Bot to'xtatildi."
