# Rekonsiliasi Engine Baru vs Angka Sistem Lama

Dijalankan 30 Juli 2026 · `as_of_date = 2026-07-26`

Sesuai [01-PRD.md §8](01-PRD.md), engine baru divalidasi terhadap angka sistem lama
**sebelum** UI dibangun. Dokumen ini merekam hasilnya.

> ✅ **UPDATE PENTING:** setelah dokumen ini ditulis, ditemukan **kode sumber sistem
> lama** (aplikasi Google Apps Script, dengan README teknis) yang mengonfirmasi
> langsung — bukan tebakan lagi — tiga hal yang sebelumnya berstatus hipotesis:
> urutan prioritas cluster (§3.1 lama → sekarang §0 di bawah), definisi Frequency
> berbasis hari bukan `idpesan`, dan sumber Cluster B dari dataset KSB terpisah.
> Screenshot dashboard legacy yang dibagikan juga mengonfirmasi total 14 cluster
> = **15.626**, sama persis dengan penjumlahan angka konsep yang dipakai sebagai
> target di bawah — jadi angka target ini **nyata**, bukan ilustrasi.

---

## 0. Urutan prioritas TERVERIFIKASI (menggantikan dugaan awal)

```
10  B          60  A2
20  A1         70  A3
30  C-Prodig   80  A4
31  C-HP       90  E
32  C-F2      100  F
40  D-New
41  D-Old
50  Dhp-New
51  Dhp-Old
```

Dugaan awal (E di priority 60, sebelum A2/A3/A4) **salah** — sudah diuji ulang
persis meniru urutan ini (bukan cuma pendekatan "batasi E ke F1") dan hasilnya
identik: `|Δ| = 1.197`. Detail penjelasan di [02-CLUSTER-RULES.md §2](02-CLUSTER-RULES.md).

---

## 1. Sumber data yang ternyata dibutuhkan

Analisis file `[Web Based] COHORT ANALYSIS - ALL PRODUCT.xlsx` (6,7 MB, 7 sheet)
mengungkap bahwa sistem lama memakai **tiga** sumber, bukan satu:

| Sheet | Baris | Isi | Dipakai untuk |
|---|---:|---|---|
| `Setup Data` | 21.724 | Transaksi Probetes, Jul 2024 – Jul 2026 | ekstrak BigQuery dari Database All (hanya yang punya nomor) |
| **`DataKSB`** | **42.681** | Transaksi KSB, Mar 2022 – Jul 2026 | **Cluster B** |
| `ProdukProbetes` | 37 | Daftar produk fisik Probetes | klasifikasi produk |
| `ProdukKSB` | 1 | `Yacona 60` | klasifikasi produk |
| **`masukWA`** | **2.627** | No HP + Nama | **has_group** |
| `BackupMasukGrup` | 1.805 | No HP + Nama | cadangan has_group |
| `tidakmasukWA` | 112 | No HP + Nama | negatif |

> **Konsekuensi arsitektur:** aplikasi V1 harus menerima **3 upload**, bukan 1 —
> Database All, DataKSB, dan daftar grup. Lihat [07-OPEN-QUESTIONS.md](07-OPEN-QUESTIONS.md) Q12.

### KSB adalah lini bisnis terpisah

`DataKSB` berisi produk yang selama ini muncul sebagai "produk asing" di Database All:

```
Yacona 60     31.827      Etawaku          42      Probiogel     7
Bio Insuleaf   9.765      Teacona 20       14      Freshmag      4
Etawalin         510      PBH 70           10      Zymuno        8
Nutriflakes      475
```

23.038 customer, hanya **4.953** yang juga muncul di Database All.
Catatan perusahaan *"buat data base sendiri untuk data yacona"* merujuk ke sheet ini.

---

## 2. Hasil rekonsiliasi final — backend TypeScript production

Dijalankan lewat `npm run validate:legacy` menggunakan **parser, normalizer, feature
builder, dan cluster engine yang sama dengan backend aplikasi** — bukan simulasi
Python terpisah. Sumber: `01. database All.xlsx` + workbook legacy (`DataKSB`,
`masukWA`, `BackupMasukGrup`).

Konfigurasi: `order_key = (tanggal, nomor HP)` · `B dari DataKSB` · urutan
A2/A3/A4 sebelum E · `has_group = masukWA ∪ BackupMasukGrup` ·
`as_of_date = 2026-07-26`.

| Cluster | Engine baru | Sistem lama | Selisih | Status |
|---|---:|---:|---:|---|
| A1 | 217 | 209 | +8 | ✅ |
| A2 | 1.223 | 1.215 | +8 | ✅ |
| A3 | 439 | 445 | −6 | ✅ |
| A4 | 342 | 322 | +20 | ✅ |
| **B** | **1.007** | **1.006** | **+1** | ✅ |
| C-Prodig | 1.273 | 1.259 | +14 | ✅ |
| C-HP | 24 | 32 | −8 | ✅ |
| C-F2 | 85 | 65 | +20 | ✅ |
| D-New | 286 | 236 | +50 | 🟡 |
| D-Old | 4.453 | 4.569 | −116 | 🟡 |
| Dhp-New | 216 | 160 | +56 | 🟡 |
| **Dhp-Old** | **517** | **281** | **+236** | ❌ belum jelas |
| E | 5.092 | 4.980 | +112 | 🟡 |
| F | 884 | 847 | +37 | ✅ |

**Total deviasi absolut `|Δ| = 692`**, turun dari simulasi awal 1.197.
Empat cluster utama hampir identik: **B +1, A1 +8, A2 +8, A3 −6**.

Data quality pada file aktif: **307 item produk unknown**, berdampak pada
**117 customer `NEEDS_REVIEW`**. Status ini sengaja tidak dimasukkan Cluster F.

---

## 3. Temuan yang menentukan

### 3.1 Order key: `(tanggal, nomor HP)` — bukan `idpesan` — ✅ DIKONFIRMASI

| Order key | A4 | |Δ| total |
|---|---:|---:|
| `(tanggal, HP, idpesan)` | 437 (+115) | 2.257 |
| **`(tanggal, HP)`** | **324 (+2)** | **2.023** |

Sistem lama memperlakukan **satu customer + satu tanggal = satu order**. Ini awalnya
tampak bertentangan dengan [06-DATA-FINDINGS.md §2](06-DATA-FINDINGS.md) yang menemukan
`idpesan` format teks adalah ID order asli — tapi kode sumber legacy mengonfirmasi
eksplisit: *"Freq = jumlah hari unik transaksi (`uniqueDates.size`), bukan idpesan."*
Kedua temuan **benar sekaligus**: `idpesan` valid untuk identitas per-item, tapi
Frequency/Cluster secara sengaja dihitung per hari. Resolusi: Q13.

### 3.2 Cluster B dihitung dari DataKSB, bukan dari Yacona di Database All — ✅ DIKONFIRMASI

```
DataKSB · seluruh produk · F > 5   →  1.007 customer
Angka sistem lama                  →  1.006 customer      selisih 1
```

Dikonfirmasi ganda: kecocokan numerik (selisih 1 dari ±43.000 baris) **dan** kode
sumber legacy yang eksplisit menyebut sheet `DataKSB` terpisah, khusus untuk Cluster B.
Ambang `> 5` (≥ 6) **terkonfirmasi benar** dari dua arah sekaligus.

Simulasi hanya menghasilkan 603 karena dibatasi customer yang ada di Database All.
**404 customer Cluster B tidak pernah muncul di Database All sama sekali** —
mereka murni pelanggan KSB.

Perbandingan basis penghitungan:

| Basis | F > 5 |
|---|---:|
| DataKSB, seluruh produk KSB | **1.007** ✅ |
| DataKSB, hanya Yacona | 809 |
| Database All, hanya Yacona | 208 |

Jadi *"Data Yacona"* dalam aturan perusahaan berarti **"Data KSB"** —
Yacona adalah 75% dari volume KSB.

### 3.3 Cluster E efektif F = 1 — ✅ DIKONFIRMASI (bukan aturan tambahan)

| Konfigurasi | A2 | E | |Δ| total |
|---|---:|---:|---:|
| E dicek sebelum A2/A3/A4 (dugaan awal) | 863 (−352) | 5.550 (+570) | 1.993 |
| **A2/A3/A4 dicek sebelum E (urutan asli legacy)** | **1.253 (+38)** | **5.100 (+120)** | **1.197** |

Dikonfirmasi dari kode sumber legacy: urutan evaluasi memang
B→A1→A2→A3→A4→C→D→Dhp→E→F — A2/A3/A4 dicek **sebelum** E. Karena F=2/3/4+ sudah
diserap A2/A3/A4 duluan, E secara efektif hanya kebagian F=1. **Teks aturan E sendiri
tidak diubah** (tidak ada syarat F=1 ditambahkan) — ini murni akibat urutan evaluasi.
Detail: [02-CLUSTER-RULES.md §2](02-CLUSTER-RULES.md). Resolusi: Q14.

### 3.4 `as_of_date` bukan tanggal lain

Diuji 5 tanggal; makin mundur makin jauh:

| as_of | |Δ| |
|---|---:|
| **2026-07-26** | **1.993** |
| 2026-04-30 | 4.700 |
| 2026-03-31 | 5.676 |
| 2026-01-31 | 7.064 |

Angka sistem lama memang dari kondisi terbaru. Hipotesis "snapshot bulan April" ditolak.

### 3.5 `masukWA` lebih tepat daripada `BackupMasukGrup`

| Sumber has_group | Nomor | C-Prodig | |Δ| total |
|---|---:|---:|---:|
| `masukWA` | 2.627 | 1.181 (−78) | 2.255 |
| **gabungan** | 2.654 | 1.275 (+16) | 2.023 |
| `BackupMasukGrup` | 1.805 | 738 (−521) | 2.971 |

Gabungan `masukWA ∪ BackupMasukGrup` paling cocok.
Catatan: 11 nomor muncul di `masukWA` **dan** `tidakmasukWA` sekaligus — kontradiksi
data sumber, perlu dibersihkan.

---

## 4. Yang masih belum terjelaskan — angka run production terakhir

| Cluster | Δ | Dugaan |
|---|---:|---|
| **Dhp-Old** | **+236** | Terbesar; mungkin terkait interpretasi "bulan sebelumnya" atau filter tanggal legacy (Q15/Q16) |
| D-Old | −116 | Mungkin terkait pembagian C/D atau filter tanggal legacy |
| E | +112 | Mungkin terkait histori pembelian fisik yang terpotong filter tanggal legacy |
| Dhp-New | +56 | Terkait Dhp-Old / filter tanggal legacy |
| D-New | +50 | Batas 15 hari mungkin dihitung dari titik tanggal lain |
| F | +37 | Efek berantai residual; sudah dalam toleransi |

Delta lain (A1 +8, A2 +8, A3 −6, A4 +20, B +1, C-Prodig +14,
C-HP −8, C-F2 +20) kecil dan dianggap cukup dekat untuk V1.

Prioritas klarifikasi: jawab Q16 (apakah filter tanggal legacy mengubah transaksi yang
dihitung) sebelum mengubah interpretasi Dhp-Old atau batas D. Semua perubahan aturan
tetap memerlukan persetujuan tertulis pemilik proses bisnis.

Selisih harus muncul di laporan rekonsiliasi aplikasi agar dapat ditelusuri
per-customer, bukan ditebak.

---

## 5. Yang wajib ada di aplikasi

Sesuai PRD §8, halaman rekonsiliasi harus menyediakan:

```
Cluster      Baru    Lama    Selisih
Dhp-Old       520     281      +239   [ Tampilkan 239 customer ]
```

Klik → daftar customer yang berbeda, lengkap dengan `reason` JSONB masing-masing,
sehingga selisih dapat ditelusuri, bukan ditebak.

---

## 6. Migrasi KSB: Legacy backfill + Database All (2026-07-31)

Keputusan stakeholder: **Legacy KSB** (`DataKSB` csv, Mar 2022 – Jul 2026) adalah
histori satu-kali (bukan upload rutin); mulai sekarang **Database All** adalah
satu-satunya sumber operasional, dan item KSB yang nyasar di dalamnya harus ikut
dihitung ke Cluster B — bukan dibuang seperti sebelumnya. Lihat
[02-CLUSTER-RULES.md §3.1](02-CLUSTER-RULES.md), [03-ERD.md](03-ERD.md) `ksb_transactions`.

### 6.1 Legacy KSB — parse & dedup

| Tahap | Jumlah |
|---|---:|
| Baris sumber (csv) | 42.681 |
| Excluded (phone/tanggal invalid) | 51 |
| `SKIPPED_NON_KSB_FROM_LEGACY` (mis. PBH 70 → `HERBAL_PROBETES`, bukan KSB) | 10 |
| Transaksi KSB setelah dedup (content-key: phone+tanggal+produk canonical+qty+amount) | **42.484** |

PBH 70 tetap `HERBAL_PROBETES` sesuai Product Catalog (source of truth, bukan file
asal) — 10 baris ini **tidak** masuk `ksb_transactions`, **tidak** dipakai Cluster B,
**tidak** masuk RFM/Cohort Probetes (Legacy KSB murni untuk backfill+Cluster B, di
luar itu bukan sumber RFM). Jejak audit tetap ada: `data_quality_issues` dengan
`issue_type = 'SKIPPED_NON_KSB_FROM_LEGACY'`.

### 6.2 Database All — item KSB yang sebelumnya dibuang total

`database-all-parser.ts` selalu mengeluarkan item `product_family=KSB` dari
`orders`/`order_items` (benar, sesuai §3.1) — tapi sebelumnya item itu **hilang
total**, tidak ditangkap ke mana pun. Sekarang ditangkap ke `ksb_transactions`
dengan key yang sama seperti Legacy, sehingga overlap otomatis dedup lewat
`ksb_transactions_source_key_uq`.

| Tahap | Jumlah |
|---|---:|
| Item `product_family=KSB` di Database All (raw) | 8.674 |
| Distinct content-key (parser saat ini) | **8.456** |

> **Koreksi 1 Agu 2026.** Angka 8.458 pada versi sebelumnya berasal dari era
> parser lama. Parser saat ini menghasilkan **8.456** content-key dari staging
> Database All. Lihat §6.8 untuk penyelesaian drift-nya.

### 6.3 Reconciliation Legacy vs Database All

| Kategori | Jumlah |
|---|---:|
| Overlap (key sama persis di kedua sumber) | 8.062 |
| Legacy-only (baru diinsert dari backfill) | 34.422 |
| Database-All-only (transaksi valid, tidak ada di export Legacy) | 396 |
| **Total canonical `ksb_transactions`** | **42.873** |

**Sample audit 396 transaksi Database-All-only** (30 sampel, stratifikasi
periode/customer/produk): 100% punya `idpesan` valid, tersebar 18 CS berbeda,
3 divisi, 4 produk KSB — tidak ada pola error sistematis. Diterima sebagai
transaksi sah (bukan artefak duplikasi).

### 6.4 Cluster B — baseline baru

| Basis | Cluster B (F > 5) |
|---|---:|
| Sistem lama | 1.006 |
| Legacy KSB saja (csv standalone) | 1.007 |
| **Canonical: Legacy + Database All (dedup)** | **1.018** ✅ baseline baru |

Selisih **+11** dari 1.007 murni berasal dari 396 transaksi Database-All-only yang
tidak pernah ada di export Legacy — sejumlah kecil customer yang tadinya pas di
ambang `yacona_frequency = 5` naik ke `>5` begitu histori terbaru ikut dihitung.
Ini sesuai desain (rule migrasi KSB), bukan penyimpangan — angka **tidak**
dipaksakan kembali ke 1.007.

`YACONA_NON_COHORT` pasca-migrasi: **21.557** (customer yang hanya punya transaksi
KSB, `yacona_frequency <= 5`) — jauh lebih besar dari perkiraan lama "±404" di
[02-CLUSTER-RULES.md §6](02-CLUSTER-RULES.md); ±404 ternyata angka dari konteks lain
(customer Cluster B yang KSB-murni, §3.2 di atas), bukan populasi
`YACONA_NON_COHORT` secara keseluruhan — perlu dikoreksi di §6 dokumen tsb.

### 6.5 Bug ditemukan & diperbaiki selama migrasi: header `Total Harga` tidak stabil

File export `DataKSB` yang dipakai untuk backfill ternyata berubah format header
antar-export (`Total Harga` tanpa spasi di versi awal, `" Total Harga "` dengan
spasi di versi yang dipakai backfill) — `ksb-parser.ts` awalnya membaca kolom
dengan exact-match sehingga **seluruh amount Legacy KSB terbaca 0** pada percobaan
pertama. Tidak memengaruhi Cluster B (frequency dihitung dari tanggal, bukan
amount) tapi merusak dedup lintas-sumber (amount ikut jadi bagian key) — overlap
yang harusnya 8.062 sempat terbaca 7 saja. Diperbaiki dengan lookup toleran-spasi
bersama (`src/server/import/source-row.ts`, dipakai `database-all-parser.ts` dan
`ksb-parser.ts`), backfill dijalankan ulang, angka di atas sudah benar. Regression
test: `tests/import.test.ts` — "header 'Total Harga' dengan spasi".

### 6.6 Catatan sampingan (tidak terkait migrasi KSB, ditemukan saat verifikasi)

`customer_group_memberships` kosong (0 baris) di database saat ini — daftar
`masukWA`/`BackupMasukGrup` belum pernah diimpor. Akibatnya `has_group` selalu
`false`, sehingga **C-Prodig, C-HP, C-F2 saat ini semuanya 0** (customer yang
seharusnya masuk cluster itu jatuh ke D-New/D-Old/Dhp-New/Dhp-Old). Ini gap
pre-existing yang tidak berkaitan dengan migrasi KSB — dicatat di sini supaya
tidak disangka efek samping perubahan ini. Cluster B tidak terpengaruh (tidak
bergantung `has_group`).

### 6.7 Perubahan kode

- `ksb-parser.ts`: klasifikasi produk via `classifyProduct` (bukan raw name),
  skip non-KSB dengan audit trail, key canonical dipakai bersama Database All.
- `database-all-parser.ts`: item KSB ditangkap ke `ksbTransactions` (field baru
  di `DatabaseAllParseResult`), bukan dibuang; `orders`/`order_items` tidak berubah.
- `orchestrator.ts`: `upsertKsbCanonical` (dipanggil dari `commitDatabaseAllImport`
  dan `scripts/import-legacy-ksb.ts`); `rebuildRfm`/`rebuildClusters` sekarang
  berbasis `customers` (bukan cuma `orders`) supaya customer KSB-murni ikut
  dievaluasi Cluster B — sebelumnya customer yang 100% tidak pernah beli Probetes
  tidak pernah masuk `customer_rfm_current` sama sekali.
- `queries.ts`: `getRfmAnalytics`/`getDashboardSummary` dipagari `frequency > 0`
  supaya customer KSB-murni (frequency=0) tidak menodai RFM/Dashboard Probetes;
  Cohort/Retention/Frequency sudah otomatis aman (dihitung dari `orders`).
- `products.isYacona` → `products.isKsbProduct` (rename kecil, 4 file + migration
  `ALTER TABLE products RENAME COLUMN`) — bukan lagi technical debt.
- `scripts/import-legacy-ksb.ts`: backfill sekali-jalan, idempoten (unique key),
  audit trail `SKIPPED_NON_KSB_FROM_LEGACY`, migration summary di console.
- Migration: `0002_calm_giant_man.sql` — `ALTER TYPE issue_type ADD VALUE
  'SKIPPED_NON_KSB_FROM_LEGACY'` + rename kolom di atas.

---

## 7. Populasi CRM final — angka live per 1 Agu 2026

Diverifikasi ulang langsung dari Neon (bukan dari catatan lama). Perhatikan
**satuan** tiap baris — halaman `/reconciliation` menampilkan angka yang sama
lengkap dengan label universe dan persamaan balance-nya.

| Metrik | Satuan | Jumlah |
|---|---|---:|
| Customer kanonik | customer | 37.833 |
| ├─ Customer Probetes (punya order) | customer | 15.396 |
| └─ Customer KSB-only | customer | 22.437 |
| Populasi RFM Probetes (`frequency > 0`) | customer | 15.396 |
| Cluster resmi A1–F | customer | 16.156 |
| NEEDS_REVIEW | customer | 123 |
| YACONA_NON_COHORT | customer | 21.554 |
| Order kanonik | order | 20.618 |
| Item order | item | 24.024 |
| Transaksi KSB kanonik | transaksi | **42.880** |

Persamaan yang harus balance (dicek otomatis di halaman Reconciliation):

```
customer Probetes + customer KSB-only          = customer kanonik
cluster resmi + needs review + yacona non-cohort = baris cluster = baris RFM
baris membership + customer tanpa baris        = customer kanonik
order = source_order_key unik, item = source_item_key unik, KSB = key unik
```

---

## 8. Penyelesaian drift KSB (1 Agu 2026)

Audit end-to-end menemukan sisa drift dari bug §6.5 yang **belum** tuntas:

| Kategori | Jumlah | Tindakan |
|---|---:|---|
| MISSING — key dihasilkan parser terbaru tapi belum ada di canonical | **7** | ✅ di-INSERT lewat `npm run backfill:ksb -- --apply` |
| STALE — key di canonical yang tidak lagi dihasilkan parser | **2** | ⚠️ **sengaja DIPERTAHANKAN** |

### Kenapa 7 baris MISSING tidak mengubah Cluster B

Ketujuhnya `amount = 0` (Yacona), dan **ketujuh tanggalnya sudah ada** di
`ksb_transactions` untuk nomor yang sama. Karena
`yacona_frequency = COUNT(DISTINCT transaction_date)`, tidak satu pun menambah
hari unik → **Cluster B tetap 1.018**, nol customer berpindah cluster.

### Kenapa 2 baris STALE TIDAK dihapus

Pemeriksaan dampak sebelum eksekusi menunjukkan keduanya adalah **satu-satunya
baris pada pasangan (phone, tanggal)**-nya, dengan amount wajar (Rp440.000 dan
Rp448.000 — bukan artefak amount=0):

```
6282176243939  2025-02-09   hari unik 4 -> 3  bila dihapus
6287765514758  2025-02-03   hari unik 1 -> 0  bila dihapus   ← kehilangan seluruh histori KSB
```

Key-nya menyimpang, tetapi **transaksinya sah**. Menghapusnya berarti membuang
hari transaksi nyata; customer kedua bahkan akan hilang dari
`customer_rfm_current` dan kehilangan cluster. Keputusan: pertahankan sebagai
histori. Script menolak menghapus baris stale secara default.

### Rekonsiliasi setelah backfill

```
key dari parser terbaru                 : 8.456
baris stale dipertahankan (histori sah) :     2
diharapkan asal Database All            : 8.458
canonical asal Database All (nyata)     : 8.458   ✓ balance
total canonical = key unik              : 42.880 / 42.880  ✓
Cluster B                               : 1.018 -> 1.018 (+0)
```

Script `scripts/backfill-ksb-drift.ts` idempoten — dijalankan ulang dengan
`--apply` menghasilkan 0 insert dan angka yang sama.
