param(
  [Parameter(Mandatory = $true)][string]$Path
)

# 用 Windows 自带的 OCR 引擎（Windows.Media.Ocr）识别图片文字。
# 注意：WinRT 类型投影只在 Windows PowerShell 5.1 下可用，请用 powershell.exe 运行本脚本。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
  })[0]
if (-not $asTaskGeneric) { throw '找不到 AsTask 泛型方法' }

function Await($op, $type) {
  $method = $asTaskGeneric.MakeGenericMethod($type)
  $task = $method.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapAlphaMode, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$languages = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag })
Write-Output ("可用 OCR 语言: " + ($languages -join ', '))

$full = (Resolve-Path -LiteralPath $Path).Path
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync(
    [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
    [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = $null
foreach ($tag in @('zh-Hans-CN', 'zh-CN', 'zh-Hans', 'en-US')) {
  try {
    $language = New-Object Windows.Globalization.Language $tag
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
    if ($engine) { Write-Output "使用 OCR 语言: $tag"; break }
  } catch { }
}
if (-not $engine) {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($engine) { Write-Output ("使用用户配置语言: " + $engine.RecognizerLanguage.LanguageTag) }
}
if (-not $engine) { throw '没有可用的 OCR 引擎（可能缺少语言包）' }

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

Write-Output ("图片尺寸: " + $bitmap.PixelWidth + " x " + $bitmap.PixelHeight)
Write-Output '----- OCR 文本开始 -----'
foreach ($line in $result.Lines) { Write-Output $line.Text }
Write-Output '----- OCR 文本结束 -----'

Write-Output '----- 行矩形（图片像素：x, y, 宽, 高） -----'
foreach ($line in $result.Lines) {
  $words = @($line.Words)
  if ($words.Count -eq 0) { continue }
  $minX = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
  $minY = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
  $maxX = ($words | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
  $maxY = ($words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
  Write-Output ("{0,6:N0} {1,6:N0} {2,6:N0} {3,6:N0}  |  {4}" -f $minX, $minY, ($maxX - $minX), ($maxY - $minY), $line.Text)
}
