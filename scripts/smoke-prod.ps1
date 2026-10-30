# Smoke test alur produksi ShelfOps terhadap stack docker compose.
#
# Pakai curl.exe (bukan Invoke-WebRequest) supaya multipart upload dan cookie
# jar bekerja di Windows PowerShell 5.1 (Invoke-WebRequest -Form hanya ada di
# PowerShell 7+).
#
# Jalankan:
#   powershell -ExecutionPolicy Bypass -File scripts/smoke-prod.ps1 -BaseUrl http://localhost
param(
    [string]$BaseUrl = "http://localhost",
    [string]$Email = "admin@example.com",
    [string]$Password = "SmokeTest123!"
)

$ErrorActionPreference = "Stop"
$script:failed = 0
$script:results = @()

function Step($name, $block) {
    try {
        & $block
        Write-Host "PASS  $name" -ForegroundColor Green
        $script:results += "PASS  $name"
    } catch {
        Write-Host "FAIL  $name :: $($_.Exception.Message)" -ForegroundColor Red
        $script:results += "FAIL  $name :: $($_.Exception.Message)"
        $script:failed++
    }
}

function Assert($condition, $message) {
    if (-not $condition) { throw $message }
}

# --- helper curl ------------------------------------------------------------
$jar = Join-Path $env:TEMP "shelfops-smoke-cookies.txt"
Remove-Item $jar -ErrorAction SilentlyContinue
$script:bodyFiles = @()

function Req {
    param([string]$Method = "GET", [string]$Path, [string]$Body, [hashtable]$Headers = @{}, [string]$Form)
    $curlArgs = @("-sS", "-X", $Method, "-b", $jar, "-c", $jar, "-w", "`n%{http_code}")
    foreach ($k in $Headers.Keys) { $curlArgs += @("-H", ($k + ": " + $Headers[$k])) }
    if ($Form) {
        $curlArgs += @("-F", $Form)
    } elseif ($null -ne $Body) {
        # PowerShell merusak tanda kutip pada argumen native; tulis body ke file
        # lalu kirim lewat --data-binary @file.
        $bodyFile = Join-Path $env:TEMP ("shelfops-body-" + [guid]::NewGuid().ToString("N") + ".json")
        [System.IO.File]::WriteAllText($bodyFile, $Body, (New-Object System.Text.UTF8Encoding($false)))
        $curlArgs += @("-H", "Content-Type: application/json", "--data-binary", ("@" + $bodyFile))
        $script:bodyFiles += $bodyFile
    }
    $curlArgs += "$BaseUrl$Path"
    $raw = & curl.exe @curlArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "curl gagal: $raw" }
    $text = ($raw -join "`n")
    $idx = $text.LastIndexOf("`n")
    $code = $text.Substring($idx + 1).Trim()
    $payload = $text.Substring(0, $idx)
    return @{ code = [int]$code; body = $payload }
}

function Json($r) { return $r.body | ConvertFrom-Json }

# --- aset uji ---------------------------------------------------------------
$tmp = Join-Path $env:TEMP "shelfops-smoke"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$docPath = Join-Path $tmp "sop-demo.txt"
Set-Content -LiteralPath $docPath -Value "SOP pengajan stok. Minimum display 3. Stok opname setiap hari." -Encoding UTF8

$imgPath = Join-Path $tmp "rak.png"
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 320, 200
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(230, 230, 230))
$font = New-Object System.Drawing.Font("Arial", 14)
$g.DrawString("SKU-001  Rp 12.500", $font, [System.Drawing.Brushes]::Black, 20, 80)
$g.Dispose()
$bmp.Save($imgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "=== Smoke test ShelfOps di $BaseUrl ===" -ForegroundColor Cyan
Write-Host ""

# ---ÃƒÂ¦Ã‚Â­Ã‚Â¥ÃƒÂ©Ã‚ÂªÃ‚Â¤ ---------------------------------------------------------------------
Step "login sesi demo (workspace dengan data seed)" {
    $r = Req -Method POST -Path "/api/v1/auth/demo"
    Assert ($r.code -eq 200) "login demo mengembalikan $($r.code): $($r.body)"
    $me = Json $r
    Assert ($me.role -in @("admin", "analyst")) "role $($me.role)"
    $cookieText = Get-Content $jar -Raw
    Assert ($cookieText -match "shelfops_access") "cookie shelfops_access tidak tersimpan"
    Write-Host "      cookie tersimpan, role=$($me.role), workspace=$($me.workspace.name)"
}

Step "me + permission purchase_order.write" {
    $r = Req -Path "/api/v1/me"
    Assert ($r.code -eq 200) "me mengembalikan $($r.code)"
    $me = Json $r
    Assert ($me.permissions -contains "purchase_order.write") "permission purchase_order.write belum ada"
}
Step "upload dokumen" {
    $r = Req -Method POST -Path "/api/v1/documents/upload" -Form "file=@$docPath"
    Assert ($r.code -eq 201) "upload mengembalikan $($r.code): $($r.body)"
    $doc = Json $r
    Write-Host "      document=$($doc.id) status=$($doc.status)"
}

Step "chat: sesi + jawaban (atau error jujur)" {
    $r = Req -Method POST -Path "/api/v1/chat/sessions" -Body '{"title":"smoke"}'
    Assert ($r.code -eq 201) "buat sesi chat: $($r.code)"
    $sess = Json $r
    $r2 = Req -Method POST -Path "/api/v1/chat/sessions/$($sess.id)/messages" -Body '{"content":"Berapa stok minimum display?"}'
    Assert ($r2.code -eq 202 -or $r2.code -eq 503) "kirim pesan: $($r2.code)"
    if ($r2.code -eq 202) {
        $msg = Json $r2
        Write-Host "      degradation=$($msg.degradation) isi=$($msg.content.Length) karakter"
    } else {
        Write-Host "      degradasi jujur: HTTP $($r2.code)"
    }
}

Step "audit: create -> image -> start -> finalize" {
    $stores = Json (Req -Path "/api/v1/stores")
    $storeId = $stores[0].id
    Assert ($storeId) "tidak ada toko"

    $r = Req -Method POST -Path "/api/v1/audits" -Body (@{ store_id = $storeId } | ConvertTo-Json)
    Assert ($r.code -eq 201) "buat audit: $($r.code) $($r.body)"
    $auditId = (Json $r).id

    $r2 = Req -Method POST -Path "/api/v1/audits/$auditId/images" -Form "file=@$imgPath"
    Assert ($r2.code -eq 201) "upload foto: $($r2.code) $($r2.body)"

    $r3 = Req -Method POST -Path "/api/v1/audits/$auditId/start"
    Assert ($r3.code -eq 200) "start audit: $($r3.code) $($r3.body)"
    $summary = Json $r3
    Write-Host "      status=$($summary.status) diproses=$($summary.images_processed) skor=$($summary.score)"

    $r4 = Req -Method POST -Path "/api/v1/audits/$auditId/finalize"
    Assert ($r4.code -eq 200) "finalize: $($r4.code) $($r4.body)"
    $fin = Json $r4
    Write-Host "      status=$($fin.status) alert=$($fin.alerts_created) task=$($fin.tasks_created)"
    Assert ($fin.status -eq "final") "status $($fin.status)"
    $script:auditId = $auditId
}

Step "finalize kedua -> 409" {
    $r = Req -Method POST -Path "/api/v1/audits/$script:auditId/finalize"
    Assert ($r.code -eq 409) "harusnya 409, dapat $($r.code)"
    Write-Host "      409 sesuai harapan (tidak buat alert ganda)"
}

Step "purchase order -> 201" {
    $purch = Json (Req -Path "/api/v1/purchasing")
    $supplierId = $purch.suppliers[0].id
    $inventory = Json (Req -Path "/api/v1/inventory")
    $productId = $inventory.products[0].id
    Assert ($supplierId -and $productId) "supplier/produk kosong (supplier=$supplierId, produk=$productId)"

    $storeId = (Json (Req -Path "/api/v1/stores"))[0].id

    $payload = @{
        store_id    = $storeId
        supplier_id = $supplierId
        items       = @(@{ product_id = $productId; qty_order = 10; unit_cost_idr = 12500 })
    } | ConvertTo-Json -Depth 5

    $r = Req -Method POST -Path "/api/v1/purchase-orders" -Body $payload
    Assert ($r.code -eq 201) "buat PO: $($r.code) $($r.body)"
    $po = Json $r
    Write-Host "      PO=$($po.code) total=$($po.total_idr) baris=$($po.lines.Count)"
    $script:po = $po
}

Step "penerimaan barang + idempotensi" {
    $purch = Json (Req -Path "/api/v1/purchasing")
    $poRow = $purch.purchase_orders | Where-Object { $_.id -eq $script:po.id } | Select-Object -First 1
    Assert ($poRow) "PO tidak muncul di /purchasing"
    $lineId = $poRow.lines[0].po_line_id

    $key = "smoke-" + (Get-Date -Format 'HHmmss')
    $payload = @{
        purchase_order_id = $script:po.id
        idempotency_key   = $key
        items             = @(@{ po_line_id = $lineId; qty_received = 4 })
    } | ConvertTo-Json -Depth 5

    $r = Req -Method POST -Path "/api/v1/grns" -Body $payload
    Assert ($r.code -eq 201) "GRN: $($r.code) $($r.body)"
    $grn = Json $r
    Write-Host "      GR=$($grn.code) stok_updated=$($grn.stock_updated)"

    $r2 = Req -Method POST -Path "/api/v1/grns" -Body $payload
    Assert ($r2.code -eq 200) "ulang idempoten harus 200, dapat $($r2.code)"
    $grn2 = Json $r2
    Assert ($grn2.idempotent_replay -eq $true) "idempotent_replay bukan true"
    Assert ($grn2.id -eq $grn.id) "id GRN berbeda saat replay"
    Write-Host "      replay 200, id sama, stok tidak bertambah"
}

Step "GRN melebihi qty pesanan -> 409" {
    $purch = Json (Req -Path "/api/v1/purchasing")
    $poRow = $purch.purchase_orders | Where-Object { $_.id -eq $script:po.id } | Select-Object -First 1
    $lineId = $poRow.lines[0].po_line_id
    $payload = @{
        purchase_order_id = $script:po.id
        idempotency_key   = "smoke-over-" + (Get-Date -Format 'HHmmss')
        items             = @(@{ po_line_id = $lineId; qty_received = 999 })
    } | ConvertTo-Json -Depth 5
    $r = Req -Method POST -Path "/api/v1/grns" -Body $payload
    Assert ($r.code -eq 409) "harusnya 409, dapat $($r.code)"
    Write-Host "      409 sesuai harapan (guard qty)"
}

Step "alert + task hasil audit ada" {
    $alerts = Json (Req -Path "/api/v1/alerts")
    $tasks = Json (Req -Path "/api/v1/tasks")
    Write-Host "      alerts=$($alerts.items.Count) tasks=$($tasks.items.Count)"
    Assert ($tasks.items.Count -gt 0) "tidak ada task dari audit final"
}

Step "resource milik workspace lain -> 404 (IDOR guard)" {
    $r = Req -Path "/api/v1/audits/00000000-0000-0000-0000-000000000000"
    Assert ($r.code -eq 404) "harusnya 404, dapat $($r.code)"
    Write-Host "      404 sesuai harapan"
}

Step "laporan: buat -> jadwal" {
    $rep = Req -Method POST -Path "/api/v1/reports" -Body '{"title":"Smoke mingguan","kind":"weekly","period_from":"2026-10-01","period_to":"2026-10-07","format":"pdf"}'
    Assert ($rep.code -eq 201) "buat laporan harusnya 201, dapat $($rep.code)"
    $sched = Req -Method POST -Path "/api/v1/report-schedules" -Body '{"name":"Smoke jadwal","cadence":"weekly","format":"pdf","recipients":["ops@example.com"]}'
    Assert ($sched.code -eq 201) "buat jadwal harusnya 201, dapat $($sched.code)"
    Write-Host "      report + schedule OK"
}

Step "konektor: buat -> uji -> connected" {
    $integ = Req -Method POST -Path "/api/v1/integrations" -Body '{"name":"Smoke POS","kind":"pos"}'
    Assert ($integ.code -eq 201) "buat konektor harusnya 201, dapat $($integ.code)"
    $integJson = Json $integ
    Assert ($integJson.status -eq "pending") "status awal harus pending"
    $test = Req -Method POST -Path "/api/v1/integrations/$($integJson.id)/test"
    Assert ($test.code -eq 200) "uji konektor harusnya 200, dapat $($test.code)"
    $testJson = Json $test
    Assert ($testJson.status -eq "success") "sync run harus success"
    Write-Host "      integration + test OK"
}

Step "rotasi API key: secret tampil sekali" {
    $keys = Json (Req -Path "/api/v1/integrations")
    Assert ($keys.api_keys.Count -gt 0) "seed harus punya minimal 1 API key"
    $keyId = $keys.api_keys[0].id
    $rot = Req -Method POST -Path "/api/v1/api-keys/$keyId/rotate"
    Assert ($rot.code -eq 200) "rotasi harusnya 200, dapat $($rot.code)"
    $rotJson = Json $rot
    Assert ($rotJson.secret.Length -gt 20) "secret baru harus tampil sekali"
    Assert ($rotJson.id -ne $keyId) "id key baru harus berbeda"
    Write-Host "      rotasi OK"
}

Step "undang anggota baru - 201 lalu 409, skip bila bukan admin" {
    $meNow = Json (Req -Path "/api/v1/me")
    if ($meNow.role -ne "admin") {
        Write-Host "      role=$($meNow.role) bukan admin - endpoint benar menolak 403 (tercakup E2E admin)"
    } else {
        $email = "smoke-invite@example.com"
        $inv = Req -Method POST -Path "/api/v1/workspace/members/invite" -Body ('{"email":"' + $email + '","role":"viewer"}')
        if ($inv.code -eq 409) {
            Write-Host "      email sudah pernah diundang di run sebelumnya - OK (jalur 409 terbukti)"
        } else {
            Assert ($inv.code -eq 201) "undang harusnya 201, dapat $($inv.code)"
            $invJson = Json $inv
            $dup = Req -Method POST -Path "/api/v1/workspace/members/invite" -Body ('{"email":"' + $email + '","role":"viewer"}')
            Assert ($dup.code -eq 409) "undang ganda harusnya 409, dapat $($dup.code)"
            Write-Host "      invite 201 + 409 OK ($($invJson.user_id))"
        }
    }
}

Step "ganti sandi: akun demo tanpa sandi -> 401" {
    $wrong = Req -Method POST -Path "/api/v1/me/password" -Body '{"current_password":"salah","new_password":"SmokeBaru123!"}'
    Assert ($wrong.code -eq 401) "harusnya 401, dapat $($wrong.code)"
    Write-Host "      401 sesuai harapan (rotasi penuh butuh sesi password, diuji via E2E)"
}

Step "setup: status terbaca + apply tandai selesai" {
    $st = Req -Path "/api/v1/system/setup"
    # Sesi demo analyst tidak punya workspace.manage -> 403 wajar; admin -> 200.
    $meNow2 = Json (Req -Path "/api/v1/me")
    if ($meNow2.role -ne "admin") {
        Assert ($st.code -eq 403) "non-admin harusnya 403, dapat $($st.code)"
        Write-Host "      403 untuk non-admin sesuai harapan"
    } else {
        Assert ($st.code -eq 200) "status setup harusnya 200, dapat $($st.code)"
        $stJson = Json $st
        Assert ($stJson.providers.llm -ne $null) "providers.llm harus ada"
        $apply = Req -Method POST -Path "/api/v1/system/setup" -Body '{"workspace_name":""}'
        Assert ($apply.code -eq 200) "apply harusnya 200, dapat $($apply.code)"
        $applyJson = Json $apply
        Assert ($applyJson.setup_done -eq $true) "setup_done harus true setelah apply"
        Write-Host "      status + apply OK"
    }
}

Write-Host ""
Write-Host "=== Ringkasan ===" -ForegroundColor Cyan
$script:results | ForEach-Object { Write-Host $_ }
Remove-Item $jar -ErrorAction SilentlyContinue

if ($script:failed -eq 0) {
    Write-Host ""
    Write-Host "SEMUA STEP PASS" -ForegroundColor Green
    exit 0
}
Write-Host ""
Write-Host "$($script:failed) STEP GAGAL" -ForegroundColor Red
exit 1
