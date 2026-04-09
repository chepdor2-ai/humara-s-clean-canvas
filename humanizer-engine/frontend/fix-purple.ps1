$base = 'c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas\humanizer-engine\frontend\app'
$files = @(
    "$base\RootLayoutClient.tsx",
    "$base\reset-password\page.tsx"
)
foreach ($f in $files) {
    $c = [System.IO.File]::ReadAllText($f)
    $orig = $c.Length
    $c = $c.Replace('purple-600/8', 'blue-600/5')
    $c = $c.Replace('rgba(147,51,234,', 'rgba(59,130,246,')
    $c = $c.Replace('purple-950', 'blue-950')
    $c = $c.Replace('purple-900', 'blue-900')
    $c = $c.Replace('purple-800', 'blue-800')
    $c = $c.Replace('purple-700', 'blue-700')
    $c = $c.Replace('purple-600', 'blue-600')
    $c = $c.Replace('purple-500', 'blue-500')
    $c = $c.Replace('purple-400', 'blue-400')
    $c = $c.Replace('purple-300', 'blue-300')
    $c = $c.Replace('purple-200', 'blue-200')
    [System.IO.File]::WriteAllText($f, $c)
    Write-Output "$([System.IO.Path]::GetFileName($f)): done"
}
