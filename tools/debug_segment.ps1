param(
  [Parameter(Mandatory=$true)][string]$TaskId,
  [int]$SegmentIndex = 0,
  [string]$UserApi = "http://localhost:8081",
  [string]$TaskApi = "http://localhost:8082"
)

$login = @{ username = "pm"; password = "pm123" } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri ($UserApi + "/auth/login") -ContentType "application/json" -Body $login
$token = $resp.accessToken
if (-not $token) { $token = $resp.token }
$headers = @{ Authorization = ("Bearer " + $token) }

$seg = Invoke-RestMethod -Method Get -Uri ($TaskApi + "/api/tasks/" + $TaskId + "/preprocess-segments") -Headers $headers
if (-not $seg.segments -or $seg.segments.Count -le $SegmentIndex) {
  Write-Output "no_segments"
  exit 0
}

$s = $seg.segments[$SegmentIndex]
$imgUrl = $TaskApi + $s.fileUrl
$jsonUrl = $TaskApi + $s.jsonUrl
$pgwUrl = $TaskApi + $s.worldFileUrl

Write-Output ("img=" + $imgUrl)
Write-Output ("json=" + $jsonUrl)
Write-Output ("pgw=" + $pgwUrl)

$pngBytes = Invoke-WebRequest -UseBasicParsing -Uri $imgUrl -Headers $headers
Write-Output ("pngBytes=" + $pngBytes.RawContentLength)

Add-Type -AssemblyName System.Drawing
$ms = New-Object System.IO.MemoryStream(,$pngBytes.Content)
$bmp = [System.Drawing.Bitmap]::FromStream($ms)

$w = $bmp.Width
$h = $bmp.Height
$sample = 0
$nonBlack = 0
$nonTransparent = 0
for ($y = 0; $y -lt [Math]::Min($h, 200); $y += 10) {
  for ($x = 0; $x -lt [Math]::Min($w, 200); $x += 10) {
    $p = $bmp.GetPixel($x, $y)
    $sample++
    if ($p.A -gt 0) { $nonTransparent++ }
    if (($p.R -ne 0) -or ($p.G -ne 0) -or ($p.B -ne 0)) { $nonBlack++ }
  }
}
Write-Output ("w=" + $w + " h=" + $h + " samples=" + $sample + " nonTransparent=" + $nonTransparent + " nonBlack=" + $nonBlack)

$pgw = Invoke-WebRequest -UseBasicParsing -Uri $pgwUrl -Headers $headers
Write-Output "pgwContent:"
Write-Output $pgw.Content

$j = Invoke-RestMethod -Method Get -Uri $jsonUrl -Headers $headers
if ($j -and $j.geometry -and $j.geometry.bounds_geo) {
  Write-Output ("bounds_geo=" + ($j.geometry.bounds_geo -join ","))
}
