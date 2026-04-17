# Script de subida directa
$msg = $args[0]
if (-not $msg) { $msg = "Update" }

git add .
git commit -m $msg
git push origin main
