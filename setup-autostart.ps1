# Avto-startni ishonchli o'rnatadi (registryga to'g'ridan-to'g'ri yozadi)
$runPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$value = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\USER\Documents\Default Project\telegram-downloader-bot\start-bot.ps1"'

try {
  New-ItemProperty -Path $runPath -Name "YuklaSmartBot" -Value $value -PropertyType String -Force -ErrorAction Stop | Out-Null
  $check = (Get-ItemProperty -Path $runPath -Name "YuklaSmartBot").YuklaSmartBot
  Write-Host ""
  Write-Host "✅ AVTO-START O'RNATILDI!" -ForegroundColor Green
  Write-Host "Qiymat: $check" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Endi noutbukni qayta yoqsangiz, bot o'zi ishga tushadi." -ForegroundColor Yellow
} catch {
  Write-Host "❌ XATO: $($_.Exception.Message)" -ForegroundColor Red
}
