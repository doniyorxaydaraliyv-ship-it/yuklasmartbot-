# Noutbuk yoqilganda botni fonada ishga tushiradi va o'chib qolsa qayta ishga tushiradi
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

# Faqat bitta kuzatuvchi ishlashi uchun lock fayl
$lockFile = Join-Path $dir ".bot-lock"
try {
  $lock = [System.IO.File]::Open($lockFile, 'OpenOrCreate', 'Write', 'None')
} catch {
  exit 0
}

$node = (Get-Command node).Source
while ($true) {
  try {
    & $node index.js >> bot.log 2>> bot-error.log
  } catch {
    "Node ishga tushmadi: $_" >> bot-error.log
  }
  Start-Sleep -Seconds 10
}
