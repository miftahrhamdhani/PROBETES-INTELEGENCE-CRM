# Pertanyaan Terbuka & Asumsi Sementara

Diperbarui: 30 Juli 2026

Semua item di bawah **tidak memblokir pembangunan** — setiap asumsi sudah dipilih
agar pekerjaan bisa jalan. Tetapi jawaban stakeholder dapat mengubah angka hasil.

Status: 🔴 memblokir akurasi · 🟠 mempengaruhi angka · 🟡 kosmetik/kualitas

---

## ✅ Q1 — Data keanggotaan Grup Konsultasi — **TERJAWAB**

**Ditemukan** di `[Web Based] COHORT ANALYSIS - ALL PRODUCT.xlsx`:

| Sheet | Nomor unik |
|---|---:|
| `masukWA` | 2.627 |
| `BackupMasukGrup` | 1.805 |
| `tidakmasukWA` | 112 |
| **gabungan masukWA ∪ Backup** | **2.654** |

2.416 (91%) cocok dengan customer di Database All.
Kolom `idgrup` memang **bukan** grup konsultasi — asumsi lama dibatalkan.

**Dipakai:** `has_group = phone ∈ (masukWA ∪ BackupMasukGrup)` — kombinasi ini
menghasilkan deviasi terkecil (lihat [08-RECONCILIATION.md §3.5](08-RECONCILIATION.md)).

**Sisa pertanyaan:**
1. `masukWA` (masuk WhatsApp) dan `BackupMasukGrup` (masuk Grup) — konsep yang sama
   atau dua tahap berbeda? Aturan cluster menyebut *"masuk Grup"*.
2. **11 nomor muncul di `masukWA` DAN `tidakmasukWA` sekaligus** — kontradiksi di
   data sumber, perlu dibersihkan Nayla.
3. Sheet ini diupdate manual. Perlu jalur upload tersendiri di aplikasi.

---

## ✅ Q2 — Ambang Cluster B — **TERPECAHKAN**

```
DataKSB · seluruh produk KSB · F > 5   →  1.007 customer
Angka sistem lama                      →  1.006 customer     selisih 1
```

**Ambang `> 5` (≥ 6) TERKONFIRMASI BENAR.**

Yang keliru adalah **basis penghitungannya**:

| Basis | F > 5 |
|---|---:|
| **DataKSB, seluruh produk KSB** | **1.007** ✅ |
| DataKSB, hanya Yacona | 809 |
| Database All, hanya Yacona | 208 (asumsi lama ❌) |

*"Data Yacona"* dalam aturan perusahaan berarti **"Data KSB"** — Yacona adalah
75% volume KSB (31.827 dari 42.681 baris).

**404 customer Cluster B tidak pernah muncul di Database All** — mereka murni
pelanggan KSB. Ini memunculkan Q12.

---

## ✅ Q3 — Monetary: `Nilai Produk` tanpa ongkir — **DIKUATKAN oleh legacy**

**Temuan:** `Total Bayar` kosong 80%, dan berbeda dari `Nilai Produk` di 6.133 kasus.
`Nilai Produk` hanya kosong 53 baris.

**Dikuatkan:** sistem lama (`Setup Data`/`DataKSB`) memakai kolom **"Total Harga"**
per baris transaksi — persis setara `Nilai Produk` per item di Database All, dijumlah
per hari (bukan per `idpesan`). Tidak ada kolom ongkir terpisah di sistem lama sama
sekali. Ini menguatkan (bukan sekadar asumsi) bahwa Monetary = jumlah nilai produk,
**tanpa ongkir/fee COD**, adalah definisi yang konsisten dengan sistem lama.

`order_total = SUM(Nilai Produk seluruh item non-KSB dalam order hari itu)`

**Dampak:** langsung mempengaruhi ambang A1 Rp1.500.000. Angka rekonsiliasi A1
(217 vs 209, lihat [08-RECONCILIATION.md](08-RECONCILIATION.md)) sudah dihitung
dengan definisi ini dan hasilnya dekat — konfirmasi tambahan bahwa ini benar.

**Sisa pertanyaan:** kalau di masa depan bisnis ingin Net Monetary (dikurangi ongkir/retur),
itu perubahan definisi, bukan bug — jadikan kandidat V1.1 (`Gross` vs `Net Monetary`).

---

## 🟠 Q4 — Retur COD tidak tercatat

**Temuan:** kolom `Status` kosong 99,97% (hanya 9 baris terisi), `Alasan Retur`
dan `Tgl Status Penerimaan` kosong total — padahal ada 4.499 order COD.

**Asumsi (sesuai PRD §14):** tidak mengarang rule settlement. Monetary = nilai order
dibuat. UI diberi label *"belum dikurangi retur"*.

**Pertanyaan:** apakah data status pengiriman/retur tersedia di sistem lain?
Jika ya, ini kandidat kuat untuk V1.1 (`Gross` vs `Net Monetary`).

---

## ✅ Q5 — Produk di luar daftar resmi — **SEBAGIAN TERJAWAB**

Sheet `ProdukProbetes` (37 produk) dan `DataKSB` menjelaskan sebagian besar:

**→ Produk KSB, bukan Probetes** (terkonfirmasi dari `DataKSB`):
```
BIO INSULEAF · ETAWALIN · ETAWAKU · NUTRIFLAKES · ZYMUNO
PROBIOGEL · FRESHMAG · TEACONA 20 · TEACONA
```

**→ Produk Probetes** (ada di `ProdukProbetes`):
```
BUKU KURUS · MINYAK CCO · MINYAK KELAPA · MINYAK KELAPA VCO
MINYAK KELAPA CCO · MINYAK VCO · BERAS MERAH · HP · HP COD
```

**Catatan penting:** `ProdukProbetes` **tidak memuat Ebook sama sekali** — daftar itu
hanya produk fisik. Padahal Ebook adalah 14.386 dari 21.724 baris `Setup Data`.
Jadi `ProdukProbetes` berfungsi sebagai daftar **produk fisik**, bukan daftar produk lengkap.

**Masih belum jelas:**
```
GOMILK 200 · GM · GMB · NEU20 · EKA FARM
WEBINAR · KELAS MEAL PLAN · KONSUL MEAL PLAN · REKAMAN WEBINAR
KONSUL PAK RAHMAN · PAKET APRESIASI REMISI · TOPPING · TAS PROBETES BONUS
AMANDIA DIET · AMANDIA MEAL PLAN · 101 MENU
```

**Asumsi:** sisanya → `UNKNOWN`, customer terdampak → `NEEDS_REVIEW`, menunggu approval
admin di halaman Product Mapping. Import tetap jalan.

---

## 🟠 Q6 — Tiga varian minyak

Data berisi: `MINYAK KELAPA` (94) · `MINYAK KELAPA CCO` (82) · `MINYAK VCO` (33) ·
`MINYAK KELAPA VCO` (8) · `VCO` (2) · `MINYAK` (4) · `MINYAK CCO` (1)

Aturan Cluster E menyebut **minyak CCO**, **minyak kelapa**, dan **minyak VCO**
sebagai tiga item terpisah.

**Asumsi:** dipertahankan sebagai 3 canonical product
(`MINYAK_CCO`, `MINYAK_KELAPA`, `MINYAK_VCO`). `MINYAK` dan `VCO` polos → `UNKNOWN`.

**Pertanyaan:** benar tiga produk berbeda, atau sebenarnya satu produk dengan
penamaan yang tidak konsisten?

---

## 🟠 Q7 — "Amandia" pada C-HP dan Dhp

Aturan menyebut *"herbal probetes dan/atau amandia"*. Ada dua produk Amandia:
**Sereal Amandia** dan **Amandia Muesli**.

**Asumsi:** keduanya termasuk (`is_hp_or_amandia` = Herbal Probetes + Sereal Amandia
+ Amandia Muesli), konsisten dengan PRD §19.

---

## 🟠 Q8 — Tanggal patokan: tetap atau bergeser?

| Konstanta | Nilai | Dipakai |
|---|---|---|
| `LIFECYCLE_START_DATE` | 2025-11-01 | C-Prodig, C-HP, D, Dhp |
| `E_WINDOW_START` / `E_WINDOW_END` | 2025-03-01 / 2025-10-31 | E |

**Asumsi:** konstanta **tetap** (penanda peristiwa bisnis, mis. program Grup dimulai
November 2025), bukan jendela bergeser.

**Pertanyaan:** apakah suatu saat harus digeser? Jika ya, perlu jadi setting
yang bisa diubah admin, bukan konstanta kode.

---

## 🟡 Q9 — Item bonus diabaikan saat menentukan kategori order

**Temuan:** 921 baris mengandung "BONUS", 918 bernilai Rp 0, dan 917 menempel pada
order yang punya item berbayar.

**Asumsi:** item bonus **diabaikan** saat menentukan kategori order.
Alasan: order `Ebook + Stevia Bonus (Rp0)` seharusnya tetap `EBOOK_ONLY` — kalau
bonus ikut dihitung, customer keluar dari Cluster D dan salah jatuh ke F.

Item bonus tetap tersimpan di `order_items` dan tetap dihitung di Monetary (Rp 0).

**Ini interpretasi data, bukan perubahan aturan cluster.** Perlu konfirmasi.

---

## 🟡 Q10 — Nilai `CS` yang bukan orang

79 varian `CS`, sebagian bukan nama orang:
`Iklan` · `Live` · `Affiliate Eksternal` · `Affiliate Internal` ·
`Yacona Herbal Alami` · `Yacona Herbal Indonesia` · `Amandia sereal` · `Probetes`

**Asumsi:** tetap disimpan sebagai `cs_agents` dengan `is_person = false`,
sehingga filter CS bisa memisahkan orang vs kanal.

Juga perlu digabung: `WAHYU`/`Wahyu` · `FIAN`/`Fian` · `ASLA`/`Asla` · `BAGAS`/`Bagas`.
**Pertanyaan:** `FIA` dan `FITRI` orang yang sama atau berbeda?

---

## 🟡 Q11 — Baris dengan produk majemuk dalam satu sel

Ditemukan beberapa baris seperti:
```
"REMISI 90, PUASA 30, FATTLOSS, MEAL PLAN"
"EBOOK MEAL PLAN, 101 MENU"
```

**Asumsi:** diperlakukan sebagai satu alias `UNKNOWN` (tidak dipecah otomatis).
Jumlahnya kecil (< 5 baris).

---

## ✅ Q12 — Aplikasi butuh 3 sumber upload, bukan 1 — **DIKONFIRMASI, sudah masuk desain**

Konsekuensi Q1 dan Q2, dan dikonfirmasi ulang dari README aplikasi legacy
(`Code.gs`/`index.html`, Google Apps Script): sistem lama memang membaca 3 sheet
sekaligus sebagai sumber terpisah, bukan satu.

| Sumber | Isi | Menentukan |
|---|---|---|
| **Database All → `Setup Data`** | transaksi Probetes | RFM, Cohort, A1–A4, C, D, Dhp, E, F |
| **DataKSB** | transaksi KSB (Yacona, Teacona, Bio Insuleaf, Zymuno, Nutriflakes, Probiogel) | **Cluster B** |
| **masukWA / BackupMasukGrup** | daftar nomor | **has_group** → C vs D/Dhp |

Sudah masuk desain: `import_batches.source_type` (`DATABASE_ALL`/`KSB`/`GROUP_LIST`),
tabel `ksb_transactions` terpisah, tiga jalur upload independen. Lihat
[03-ERD.md](03-ERD.md), [04-DESIGN.md §4](04-DESIGN.md), [01-PRD.md §4](01-PRD.md).

**Sisa pertanyaan operasional:**
1. DataKSB diperbarui berapa sering, dan diekspor dari mana (sistem apa)?
2. **404 customer Cluster B yang tidak ada di Database All** — perlu muncul di daftar
   customer aplikasi (baris `customers` tanpa transaksi Probetes), atau cukup
   ditampilkan sebagai baris `ksb_transactions` tanpa entitas `customers`?
   **Asumsi sementara:** tidak butuh baris `customers` — ditampilkan lewat halaman
   Cluster B saja dari `ksb_transactions`, bukan halaman Customers utama.
3. Daftar grup diupdate Nayla — upload file ulang tiap kali, atau perlu UI tambah/hapus
   nomor satu-satu?

---

## ✅ Q13 — Order key: dengan atau tanpa `idpesan`? — **TERJAWAB (dikonfirmasi dari kode sumber)**

README aplikasi legacy menyatakan eksplisit: *"Freq = jumlah **hari unik** customer
melakukan transaksi (bukan jumlah baris/qty). Dihitung dari `uniqueDates.size`."*

**Order key = `(order_date, normalized_phone)` — satu hari = satu order.** Ini bukan
lagi asumsi, melainkan definisi teknis sistem lama yang harus direplikasi persis
supaya Frequency (dan seluruh cluster yang bergantung padanya) tetap sama.

`idpesan` dari [06-DATA-FINDINGS.md §2](06-DATA-FINDINGS.md) tetap valid sebagai ID
order individual, tapi **tidak dipakai** untuk Frequency — hanya disimpan di
`order_items.external_id` untuk audit. Sudah masuk desain: [03-ERD.md](03-ERD.md),
[02-CLUSTER-RULES.md §3.2](02-CLUSTER-RULES.md).

**Sisa catatan:** kalau nanti bisnis ingin Frequency berbasis `idpesan` (2 transaksi
beda checkout di hari sama = 2 order), itu perubahan pada definisi Frequency sistem
lama itu sendiri — bukan keputusan implementasi V1 ini.

---

## ✅ Q14 — Cluster E: dibatasi F1 atau tidak? — **TERJAWAB (urutan prioritas, bukan aturan baru)**

Dikonfirmasi dari kode sumber legacy: urutan evaluasi cluster adalah
**B → A1 → A2 → A3 → A4 → C-Prodig → C-HP → C-F2 → D-New → D-Old → Dhp-New →
Dhp-Old → E → F** — A2/A3/A4 dievaluasi **sebelum** E.

Karena A2 (F=2)/A3 (F=3)/A4 (F≥4) sudah menangkap semua customer F≥2 (kecuali kandidat
C-F2/D yang diselesaikan lebih dulu), **hanya customer F=1 yang tersisa untuk dicek E**.
Diuji ulang dan hasilnya identik dengan skenario "E dibatasi F=1" (`|Δ|=1.197`).

**Ini BUKAN penambahan syarat F=1 ke teks aturan E** (teks aturan E tidak diubah sama
sekali) — ini konsekuensi dari urutan evaluasi yang benar. Lihat penjelasan lengkap di
[02-CLUSTER-RULES.md §2](02-CLUSTER-RULES.md).

**Status: SUDAH DITERAPKAN ke urutan prioritas di [02-CLUSTER-RULES.md](02-CLUSTER-RULES.md).**

---

## 🟠 Q15 — Dhp-Old kelebihan 236 customer

Mismatch terbesar pada run backend TypeScript production terakhir:
**517 vs 281 (+236, +84%)**. D-Old (−116), E (+112), Dhp-New (+56),
dan D-New (+50) juga masih berstatus residual; lihat [08-RECONCILIATION.md §4](08-RECONCILIATION.md).

README aplikasi legacy mengonfirmasi teksnya sama persis dengan yang sudah kita pakai:
*"Dhp-Old: sama seperti Dhp-New, tapi bulan pembelian pertama sebelum bulan ini"* —
jadi selisih ini **bukan** salah tafsir kata "sebelum" (tunggal vs jamak, lihat Q16
di bawah untuk kemungkinan penyebab lain yang lebih mendasar).

**Asumsi sementara (tidak berubah):** seluruh bulan sebelumnya (jamak), karena
interpretasi tunggal ("hanya 1 bulan sebelum") membuat customer yang masuk sejak
Nov 2025 s.d. 2 bulan lalu jadi tidak punya cluster sama sekali.

---

## 🟠 Q16 — Screenshot dashboard menunjukkan filter tanggal aktif saat angka konsep diambil

**Temuan penting:** screenshot dashboard legacy yang dibagikan menunjukkan filter
`Dari 01/01/2026 — Sampai 07/30/2026` **aktif di tab Cluster juga** (bukan cuma
Cohort/Frequency), dan totalnya `ACTIVE USERS = 15.626` — **cocok persis** dengan
penjumlahan 14 angka konsep (`209+1215+445+322+1006+1259+32+65+236+4569+160+281+4980+847
= 15.626`). Ini mengonfirmasi angka konsep **nyata**, bukan ilustrasi (menjawab
keraguan lama di Q2). Tapi juga memunculkan pertanyaan baru:

**Apakah filter tanggal di header hanya membatasi TAMPILAN, atau ikut membatasi
transaksi mana yang dihitung ke F/M/first_order_date sebelum cluster ditentukan?**

- Kalau **hanya tampilan** (angka cluster dihitung dari seluruh histori, filter cuma
  mempengaruhi tabel/detail yang ditampilkan) → simulasi kita (pakai seluruh histori
  Jan 2025–Jul 2026) sudah benar secara konsep, dan sisa gap (Dhp-Old dll) murni
  soal detail lain.
- Kalau filter **ikut membatasi transaksi yang dihitung** (mis. `first_order_date`
  dihitung ulang seakan-akan histori sebelum 1 Jan 2026 tidak ada) → ini mengubah
  semua perhitungan cluster secara struktural, dan bisa jadi penjelasan utama untuk
  sisa selisih di Dhp-Old/D-Old/F.

**Dampak ke desain aplikasi baru:** filter tanggal global (PRD §13, 05-UI.md §6)
untuk V1 kita rencanakan **hanya membatasi tampilan tabel/chart**, TIDAK mengubah
`as_of_date` maupun `first_order_date` yang dipakai cluster engine (cluster harus
tetap dihitung dari seluruh histori aktif, supaya "Why this cluster?" tetap konsisten
apa pun filter yang sedang dilihat user). **Perlu dikonfirmasi ini juga cara kerja
sistem lama**, supaya definisi cluster yang direplikasi benar-benar sama.

---

## ✅ Q17 — Order yang hilang dari file baru: masih dihitung analytics atau tidak? — **DIPUTUSKAN (A)**

Ditemukan sebelum batch kedua pernah di-commit, jadi belum pernah menghasilkan
angka salah.

Mekanisme yang sudah ada di kode:
- `orders` di-upsert per `source_order_key`, dan `source_batch_id` **ikut dipindah**
  ke batch baru untuk setiap order yang ada di file baru
  ([04-DESIGN.md §2.3](04-DESIGN.md) — "order ada di DB, hilang dari file → dibiarkan")
- Order yang **hilang dari file baru** tetap memegang `source_batch_id` batch lama

Akibatnya dua jalur perhitungan tidak sepakat:

| Jalur | Cakupan sekarang | Order yang hilang dari file baru |
|---|---|---|
| Cohort / Retention / Frequency | `WHERE b.is_active = true` | **tidak dihitung** |
| RFM / Cluster (`rebuildRfm`, `rebuildClusters`) | seluruh tabel `orders` | **tetap dihitung** |

**Pertanyaan:** mana yang benar secara bisnis?

- **(A) Seluruh order kanonik.** Konsisten dengan keputusan eksplisit "data lama tidak
  pernah dihapus"; `is_active` hanya menandai batch penentu `as_of_date` + jejak audit.
  Upload file parsial tidak pernah menghilangkan angka. Konsekuensi: koreksi berupa
  *penghapusan baris* di file sumber tidak akan pernah tercermin di analytics.
- **(B) Hanya batch aktif.** Dashboard persis mencerminkan file terakhir yang diupload;
  RFM/Cluster harus ikut difilter ke batch aktif. Konsekuensi: satu upload yang tidak
  lengkap langsung memotong seluruh angka historis, dan itu sulit disadari.

**Keputusan pemilik proses (30 Juli 2026): (A) seluruh order kanonik.**

**Sudah diterapkan.** `src/server/analytics/queries.ts` memakai satu konstanta
`CANONICAL_ORDERS` + `HAS_ACTIVE_DATASET` untuk retention, frequency distribution,
dan repeat-purchase funnel — `is_active` tinggal jadi gerbang empty state, bukan
filter per order. Basisnya kini sama dengan `rebuildRfm`/`rebuildClusters`.

Diverifikasi tidak mengubah angka saat ini (masih satu batch): `as_of 2026-07-26`,
cohort customers 15.300, 19 baris cohort, F1–F5+ berjumlah 15.300.

**Sisa pekerjaan:** jalur KSB (`rebuildRfm`, `yacona_frequency`) masih memfilter
batch aktif. Samakan saat import KSB dibangun (FR-28) — sudah ditandai komentar di
`orchestrator.ts`.

---

## ✅ Q18 — Populasi CRM final: siapa yang boleh jadi canonical customer? — **DIKUNCI (keputusan pemilik proses, 2026-07-31)**

**Keputusan final:**

```
VALID CRM CUSTOMER = nama non-kosong + normalized phone valid + minimal 1 transaksi valid
```

Jika salah satu tidak ada → **IMPORT EXCLUSION**, bukan `NEEDS_REVIEW`. Baris mentahnya
tetap tersimpan di `staging_import_rows`/`data_quality_issues` untuk audit, tapi **tidak
pernah** menjadi `customers`/`orders` canonical, dan tidak pernah masuk RFM/Cohort/
Frequency/Cluster/Customers/Group Membership.

`NEEDS_REVIEW` tetap eksklusif untuk customer yang **sudah** valid CRM tapi punya isu
sekunder (`UNKNOWN_PRODUCT`, `GROUP_STATUS_CONFLICT`) — tidak pernah dicampur dengan
exclusion di atas.

**Temuan saat implementasi — dua dari tiga syarat SUDAH terpenuhi struktural sejak awal:**

1. **Phone valid** — sudah 100% ditegakkan sejak V1: `database-all-parser.ts`/
   `ksb-parser.ts` membuang baris `MISSING_PHONE`/`INVALID_PHONE` sebelum baris itu
   pernah jadi kandidat order, dan `customers.normalized_phone` adalah kolom
   `NOT NULL UNIQUE`. Tidak mungkin ada baris `customers` dengan phone kosong/invalid.
2. **Minimal 1 transaksi valid** — sudah terpenuhi struktural: `bulkUpsertCustomers`
   (Database All) dan `bulkUpsertCustomersFromKsb` HANYA membuat baris `customers`
   dari `parsed.orders`/`ksb_transactions` yang sudah lolos validasi — tidak pernah ada
   jalur lain yang membuat customer tanpa transaksi. (V1 sempat menambahkan fitur
   "create customer manual" untuk pre-enrollment CRM tanpa transaksi — **fitur ini
   dihapus** pada koreksi ini karena bertentangan langsung dengan syarat ini;
   dikonfirmasi 0 baris live data terpengaruh sebelum dihapus.)
3. **Nama non-kosong** — **ini satu-satunya gap nyata**, sudah diperbaiki: nama kosong
   sebelumnya tidak divalidasi sama sekali (menjadi `NULL` diam-diam, baris tetap jadi
   customer). Sekarang `MISSING_NAME` ditambahkan sejajar dengan `MISSING_PHONE`/
   `INVALID_PHONE`/`INVALID_DATE` di kedua parser, plus guard pertahanan-kedua di
   `rebuildRfm` (WHERE) dan `buildConditions` (query list Customers/Group Membership/
   Cluster). Data live diaudit sebelum perubahan: **0 dari 37.742 customer punya nama
   kosong** — perbaikan ini murni pencegahan untuk import berikutnya, bukan koreksi
   retroaktif (tidak ada data yang perlu dihapus).

**Soal `EXCLUDED_NO_PHONE` (`cluster-codes.ts`, disebut di FR-03/02-CLUSTER-RULES.md/
03-ERD.md) — status: by-design tidak pernah tertulis, BUKAN bug.** Nilai ini terdaftar
sebagai salah satu non-cluster status, tapi cluster engine (`engine.ts`, `rules/*.ts`)
tidak pernah menghasilkannya — dan memang tidak bisa, karena baris phone-invalid sudah
dibuang di parser, jauh sebelum baris itu bisa jadi `customers` row yang dievaluasi
cluster engine. Ini penegakan yang LEBIH KUAT daripada memberi `cluster_code =
'EXCLUDED_NO_PHONE'` (yang mengandaikan baris itu sempat jadi customer): baris
phone-invalid tidak pernah menyentuh tabel `customers` sama sekali. **Tidak diubah** —
menulis kode untuk memaksa `EXCLUDED_NO_PHONE` benar-benar tertulis akan berarti sengaja
membuat "customer hantu" hanya untuk diberi label exclude, yang lebih buruk dari desain
saat ini. Kalau suatu saat FR-03/ERD ingin dikoreksi redaksinya, itu perubahan dokumentasi,
bukan perubahan perilaku.

**"Workspace CRM" / auto-task-generation** yang disebut dalam permintaan koreksi — belum
ada implementasinya di codebase ini (bukan fitur yang sudah dibangun). Tidak ada perubahan
diperlukan; kalau/ketika fitur itu dibangun, source-of-truth populasi-nya tinggal reuse
`buildConditions`/`rebuildRfm` yang sudah memuat guard ini.

---

## Ringkasan status pertanyaan

| # | Status | Kesimpulan | Ubah jika |
|---|---|---|---|
| Q1 | ✅ terjawab | `has_group` = `masukWA ∪ BackupMasukGrup` | Nayla memastikan mana yang benar |
| Q2 | ✅ terjawab | Cluster B = DataKSB seluruh produk, `F > 5` → 1.007 (dikonfirmasi kode sumber) | — |
| Q3 | ✅ dikuatkan | Monetary = SUM Nilai Produk, tanpa ongkir (sama seperti legacy) | bisnis minta Net Monetary di V1.1 |
| Q4 | 🟠 | Monetary = nilai order dibuat | data retur tersedia |
| Q5 | ✅ sebagian | produk KSB teridentifikasi; sisanya `UNKNOWN` | admin memetakan |
| Q6 | 🟠 | 3 canonical minyak | ternyata satu produk |
| Q7 | 🟠 | Amandia = Sereal + Muesli | hanya Sereal |
| Q8 | 🟠 | Tanggal patokan tetap | perlu bergeser |
| Q9 | 🟡 | Bonus diabaikan untuk kategori order | bonus harus dihitung |
| Q10 | 🟡 | CS non-orang disimpan, `is_person=false` | — |
| Q11 | 🟡 | Produk majemuk → `UNKNOWN` | perlu dipecah |
| Q12 | ✅ dikonfirmasi | 3 jalur upload terpisah — sudah masuk desain | — |
| Q13 | ✅ terjawab | Order key = `(tanggal, HP)` — dikonfirmasi kode sumber legacy | bisnis ubah definisi Frequency |
| Q14 | ✅ terjawab | E efektif F=1 karena urutan prioritas — sudah diterapkan | — |
| Q15 | 🟠 | Dhp-Old = seluruh bulan sebelumnya (run terakhir 517 vs 281, gap +236) | lihat Q16 |
| Q16 | 🟠 | Filter tanggal V1 hanya membatasi tampilan; perilaku filter legacy belum terkonfirmasi | stakeholder/kode legacy membuktikan filter ikut hitung cluster |
| Q17 | ✅ diputuskan | Analytics = seluruh order kanonik; sudah diterapkan & diverifikasi tidak mengubah angka | jalur KSB masih perlu disamakan di FR-28 |
| Q18 | ✅ dikunci | Populasi CRM final = nama + phone valid + transaksi valid; `MISSING_NAME` baru ditambahkan, sisanya sudah struktural sejak awal | — |

**10 dari 18 pertanyaan sudah terjawab/dikonfirmasi atau diputuskan** dari kode
sumber legacy, analisis data, atau keputusan pemilik proses. Q15/Q16 tidak memblokir
V1, tetapi wajib tetap terlihat sebagai residual rekonsiliasi.
