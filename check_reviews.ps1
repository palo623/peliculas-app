$content = Get-Content 'C:\Users\pablo.lozano.ext\Desktop\proyecto series-pelis\series-peliculas-app\public\js\bundle.js' -Raw

$idx = $content.IndexOf('reviews.slice().sort((a, b) => {')
if ($idx -ge 0) {
    Write-Host 'Found at index: ' $idx
    Write-Host 'Context: ' $content.Substring($idx, 300)
} else {
    Write-Host 'Not found'
}