# AUDIT MENYELURUH — CRM RFM + WORKSPACE

**Tanggal audit:** 7 Agustus 2026
**Sifat:** READ-ONLY. Tidak ada kode, query, schema, atau data yang diubah dalam audit ini.
**Metode:** Trace source code → server action → SQL → tabel. Bukan inspeksi UI.

---

## CATATAN KEJUJURAN CAKUPAN

Audit ini berbasis **pembacaan source code dan query**, bukan eksekusi terhadap data
produksi. Yang **TIDAK** dilakukan (dan karena itu ditandai ⚪ di laporan):

- Tidak menjalankan query ke database produksi (tidak ada sampling customer nyata).
- Tidak mengukur waktu eksekusi query nyata (EXPLAIN/ANALYZE).
- Tidak menguji manual setiap tombol/kalender di browser.
- Halaman Mapping, Data Quality, History, Reconciliation, Rules, Users diaudit
  pada tingkat **struktur & sumber data**, tidak sedalam Customers/RFM/Workspace.

Temuan bertanda ✅/❌ adalah yang benar-benar tertelusuri sampai baris SQL.

---

# A. EXECUTIVE SUMMARY

Aplikasi ini **masih merupakan aplikasi Customer Intelligence (RFM/Cluster) yang benar**,
dengan engine analitik yang disiplin dan terlindungi. Namun aplikasi telah **tumbuh dua
kepala**: satu kepala analitik (`orders` → RFM → Cluster) dan satu kepala operasional
(`workspace_orders` → COS/COM → laba). Keduanya **tidak terhubung di dalam aplikasi**.

Temuan terpenting:

> **Rantai konsep `ORDER → ANALYSIS BERIKUTNYA` TIDAK TERIMPLEMENTASI di dalam aplikasi.**
> Transaksi yang di-closing CRM lewat Workspace Pesanan masuk ke tabel `workspace_orders`.
> RFM, Cohort, Frequency, dan Cluster membaca tabel `orders`. Satu-satunya `INSERT INTO orders`
> di seluruh codebase ada di import orchestrator. Artinya hasil kerja CRM baru memengaruhi
> RFM **jika dan hanya jika** transaksi itu kembali lewat file Database All pada import
> berikutnya — sebuah putaran **manual di luar sistem**.

Temuan penting kedua:

> **Otomasi "customer baru → tugas CRM" hanya berlaku untuk customer ber-divisi CRM.**
> `detectNewCustomersFromBatch` mensyaratkan `is_crm_transaction = true`
> (division='CRM' dan platform bukan marketplace). Customer baru dari **AKUISISI/TIKTOK**
> — yang secara kasat mata mendominasi data — **tidak pernah** mendapat task otomatis.

Selebihnya: cluster engine bersih dan terlindungi, security server action solid
(seluruh 100 action ber-guard), populasi customer konsisten, dan tidak ditemukan
regression dari perubahan UI terakhir.

**Verdict singkat:** konsep masih benar, **tetapi lingkarannya belum tertutup**, dan
Workspace mulai menumbuhkan fungsi ERP (approval biaya 4 tingkat, master produk kedua)
yang tidak melayani Customer Intelligence.

---

# B. CURRENT APPLICATION CONCEPT (dari source code)

Yang benar-benar terbentuk hari ini adalah **dua aplikasi yang berbagi satu registry identitas customer**:

**Aplikasi 1 — Customer Intelligence (matang, disiplin)**
```
File Database All/KSB/Group List
  → parser + normalize (phone/date/amount/product)
  → staging_import_rows
  → commit (transaction)
  → customers + orders + order_items
  → rebuildRfm()      → customer_rfm_current
  → rebuildClusters() → customer_cluster_current (+ history)
  → Dashboard / RFM / Cohort / Frequency / Cluster / Customers
```

**Aplikasi 2 — Workspace Operasional CRM (baru, tumbuh cepat)**
```
Input manual CRM
  → workspace_orders + workspace_order_items  (Sales, COS)
  → workspace_operational_costs (approval 4 tingkat)  (COM)
  → Workspace Overview (Pendapatan Bersih = Sales − COS − COM)
```

**Jembatan antara keduanya — hanya 3, dan semuanya tipis:**

| Jembatan | Arah | Kekuatan |
|---|---|---|
| `customers.normalized_phone` | Aplikasi 1 → 2 | ✅ kuat (unique, dipakai match by phone) |
| `crm_tasks.customer_id` (FK ke customers) | 1 → 2 | ✅ kuat |
| `confirmJoinedGroupFromTask` → membership → `recalculateClusterForCustomer` | 2 → 1 | ✅ **satu-satunya loop balik yang benar-benar bekerja** |
| Transaksi CRM → RFM | 2 → 1 | ❌ **TIDAK ADA** |

---

# C. EXPECTED vs ACTUAL CONCEPT

**Expected:** CRM RFM Analysis + CRM Workspace, satu lingkaran tertutup.
**Actual:** CRM RFM Analysis (✅ sesuai) + CRM Workspace (⚠️ tumbuh melewati kebutuhan CRM),
dengan lingkaran **terputus di satu titik**: transaksi hasil kerja CRM tidak kembali ke analisis.

---

# D. MODULE SCORECARD

| Modul | Tampilan | Fungsi | Logic | Data | Date Filter | Bug | Status |
|---|---|---|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ⚠️ | ✅ | ⚠️ parsial | 1 | ⚠️ |
| RFM | ✅ | ✅ | ✅ | ✅ | — (sengaja) | 1 | ⚠️ |
| Frequency | ✅ | ✅ | ✅ | ✅ | — (sengaja) | 0 | ✅ |
| Cohort | ✅ | ✅ | ✅ | ✅ | — (sengaja) | 0 | ✅ |
| Cluster | ✅ | ✅ | ✅ | ✅ | — (sengaja) | 0 | ✅ |
| Customers | ✅ | ✅ | ✅ | ✅ | ⚠️ | 2 | ⚠️ |
| Group Membership | ✅ | ✅ | ✅ | ✅ | ⚠️ | 0 | ✅ |
| Import | ⚪ | ✅ | ✅ | ✅ | n/a | 0 | ✅ |
| Mapping | ⚪ | ⚪ | ⚪ | ✅ | n/a | ⚪ | ⚪ |
| Data Quality | ⚪ | ⚪ | ⚪ | ✅ | n/a | ⚪ | ⚪ |
| History | ⚪ | ⚪ | ⚪ | ✅ | n/a | ⚪ | ⚪ |
| Reconciliation | ⚪ | ⚪ | ⚪ | ✅ | n/a | ⚪ | ⚪ |
| Rules | ⚪ | ✅ display-only | ✅ | ✅ | n/a | 0 | ✅ |
| Workspace Overview | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | 0 | ⚠️ |
| Pesanan | ✅ | ✅ | ✅ | ⚠️ | ✅ | 0 | ⚠️ |
| Pembagian Tugas | ✅ | ✅ | ⚠️ | ✅ | ✅ | 1 | ⚠️ |
| Master Produk | ✅ | ✅ | ✅ | ⚠️ | n/a | 0 | ⚠️ |
| Biaya Operasional | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | ⚠️ scope |
| Users/Auth | ⚪ | ✅ | ✅ | ✅ | n/a | 0 | ✅ |

---

# E. BUG MASTER LIST

### BUG-01 — Transaksi Workspace tidak pernah masuk RFM
- **Severity:** P0 / CRITICAL (arsitektural, bukan crash)
- **Lokasi:** `src/server/workspace/pesanan.ts` ↔ `src/server/import/orchestrator.ts:442`
- **Gejala:** Customer yang closing lewat Workspace Pesanan tidak berubah R/F/M-nya.
- **Reproduksi:** Buat pesanan baru di `/workspace/pesanan/baru` untuk customer existing → buka `/customers`, cari customer itu → F dan M tidak bertambah, Last Order tidak berubah.
- **Expected:** Transaksi CRM menambah frequency/monetary customer.
- **Actual:** `workspace_orders` terisi; `orders` tidak tersentuh; `customer_rfm_current` hanya di-rebuild saat import commit.
- **Penyebab:** Satu-satunya `INSERT INTO orders` ada di `orchestrator.ts:442` (jalur import). Tidak ada jalur tulis dari Workspace ke `orders`.
- **Dampak:** Rantai konsep putus. RFM/Cluster selalu tertinggal dari kenyataan operasional sampai import berikutnya. Cluster keputusan (mis. D-New → A1) tertunda.

### BUG-02 — Deteksi customer baru hanya untuk divisi CRM
- **Severity:** P1 / HIGH
- **Lokasi:** `src/server/workspace/detection.ts:31-34`
- **Gejala:** Setelah import, sebagian besar customer baru tidak muncul sebagai task di Pembagian Tugas.
- **Penyebab:** `AND EXISTS (... o.is_crm_transaction = true)`. Kolom itu bernilai true hanya jika `division='CRM'` dan platform bukan TIKTOK/SHOPEE/MARKETPLACE/META (`migrations/0013:145`).
- **Dampak:** Customer baru dari AKUISISI/TIKTOK — mayoritas populasi — tidak pernah otomatis masuk antrian kerja CRM. Harus dipilih manual di `/customers` → "Masukkan ke Pembagian Tugas".

### BUG-03 — KPI "Eligible customers" menghitung non-cluster sebagai eligible
- **Severity:** P2 / MEDIUM
- **Lokasi:** `src/server/analytics/queries.ts:361` (RFM) dan `:461` (Dashboard)
- **Gejala:** Angka "Eligible customers" lebih besar dari jumlah customer di 14 cluster resmi.
- **Penyebab:** `COUNT(*) FILTER (WHERE cc.cluster_code IS DISTINCT FROM 'NEEDS_REVIEW')`. Di SQL, `NULL IS DISTINCT FROM 'NEEDS_REVIEW'` = TRUE, sehingga customer **tanpa baris cluster** ikut terhitung; demikian pula `YACONA_NON_COHORT` dan `EXCLUDED_NO_PHONE` yang menurut CLAUDE.md aturan #4 **bukan cluster**.
- **Expected (sesuai label UI "Customer dalam cluster resmi"):** hanya 14 kode di `CLUSTER_CODES`.
- **Dampak:** KPI utama Dashboard & RFM overstated. Besarnya selisih = jumlah YACONA_NON_COHORT + cluster NULL. ⚪ belum dikuantifikasi (butuh query DB).

### BUG-04 — Preset kalender memakai "hari ini" nyata, bukan as_of_date dataset
- **Severity:** P2 / MEDIUM
- **Lokasi:** `src/components/filters/date-range-filter.tsx:36-58` (`buildPresets`, `new Date()`)
- **Gejala:** Preset "Hari ini" / "7 Hari Terakhir" menghasilkan tabel kosong.
- **Penyebab:** Preset dihitung dari jam browser, sedangkan dataset ber-`as_of_date` = MAX(order_date) yang bisa jauh dari tanggal nyata.
- **Dampak:** User mengira filter rusak. Bukan salah query — mismatch konsep "hari ini" vs "hari terakhir data".

### BUG-05 — Bulk action Customers = N×2 round trip berurutan
- **Severity:** P2 / MEDIUM (performance, **diperkenalkan oleh redesign terakhir**)
- **Lokasi:** `src/components/customer/bulk-membership-actions.ts:22-40`
- **Gejala:** "Tambah ke Grup"/"Ubah PIC" untuk banyak customer terasa sangat lambat.
- **Penyebab:** Loop sekuensial: per customer memanggil `loadCustomerDetail` (query berat: profil+order timeline+2 history) lalu `updateCustomerMembership` (transaction + rekalkulasi cluster). 100 customer = 200 round trip berurutan, dan `loadCustomerDetail` menarik SELURUH timeline transaksi hanya untuk membaca 4 field membership.
- **Dampak:** Operasi bulk besar berpotensi timeout. Tidak merusak data (tiap langkah transactional & idempoten), murni lambat.

---

# F. BUSINESS LOGIC ISSUES

### LOGIC-01 — "Customer Baru" bersifat per-batch, bukan per-periode
- **Current:** `customers.first_seen_batch_id = (batch DATABASE_ALL aktif)` — `buildConditions` di `analytics/customers.ts:191-197`.
- **Expected (asumsi bisnis):** "customer yang transaksi pertamanya jatuh pada periode filter aktif".
- **Dampak:**
  - ✅ **Benar:** customer repeat TIDAK salah dianggap baru (`first_seen_batch_id` hanya di-set saat INSERT pertama; `ON CONFLICT DO UPDATE` tidak menyentuhnya).
  - ⚠️ **Efek samping:** daftar "Customer Baru" **hilang begitu import berikutnya di-commit** — flag berpindah ke angkatan terbaru. Customer baru yang belum sempat ditindaklanjuti CRM tidak bisa ditemukan lagi lewat filter ini.
  - ⚠️ Tidak bisa menjawab "customer baru bulan Januari" — filter tanggal tidak memengaruhi definisi ini.
- **Penyebab:** Definisi diikat ke batch import, bukan ke `first_order_date`.

### LOGIC-02 — Filter tanggal Dashboard hanya memengaruhi 1 dari 4 KPI
- **Current:** Hanya `totalOrderValue` + `monthlyTrend` yang difilter (`queries.ts:437-443`). `eligibleCustomers`/`avgFrequency`/`avgMonetary` selalu seluruh histori.
- **Expected:** Ini **disengaja** dan terdokumentasi (Q16, CLAUDE.md #6) — angka RFM dilindungi.
- **Dampak:** Benar secara aturan, tapi berisiko salah baca: empat kartu sejajar dengan periode berbeda. Label sudah menyebut "seluruh histori" — mitigasi ada, tapi lemah secara visual.

### LOGIC-03 — Tidak ada status/riwayat "sudah dibroadcast"
- **Current:** Export broadcast menghasilkan file. Tidak ada tabel/kolom yang mencatat customer mana yang sudah masuk file broadcast.
- **Dampak:** Tidak bisa mencegah broadcast ganda; tidak bisa mengukur hasil broadcast. Jejak kerja hanya ada bila CRM memakai jalur Pembagian Tugas (yang punya `crm_task_activities`).

### LOGIC-04 — Dua definisi "penjualan" yang tidak pernah direkonsiliasi
- **Current:** Dashboard "Nilai order" = `SUM(orders.order_total)`. Workspace Overview "Total Sales" = `SUM(workspace_order_items.total_sales_value)`.
- **Dampak:** Dua angka penjualan berbeda di satu aplikasi, tanpa halaman yang menjelaskan selisihnya. (Halaman `/reconciliation` membandingkan `crm_reports` vs `orders`, **bukan** `workspace_orders` vs `orders`.) ⚪ belum diverifikasi lebih dalam.

---

# G. DATA INTEGRITY

**Yang sudah benar ✅**
- `customers.normalized_phone` UNIQUE (`customers_phone_uq`) → identitas customer tunggal.
- Repeat purchase menambah order ke customer existing, bukan membuat customer baru (upsert by phone).
- `crm_tasks_new_customer_uq` (partial unique on `customer_id WHERE task_type='FOLLOW_UP_NEW_CUSTOMER'`) → tidak ada task customer-baru ganda.
- `workspace_orders`: `order_number_uq`, `source_id_uq`, `fingerprint_uq`, `match_fingerprint_uq` → anti-duplikat berlapis.
- `customer_cluster_history` punya partial unique "satu baris terbuka per customer".
- Import idempoten via `fileHash` guard + upsert.
- Soft delete konsisten (`archived_at` / `deleted_at`), tidak ada hard delete customer.
- Cluster/membership/profile semuanya punya tabel history terpisah dari current state.

**Risiko ⚠️**
- `workspace_orders.customer_id` dan `crm_reports.customer_id` **nullable, best-effort match by phone**. Bila nomor tidak ada di Database All, transaksi CRM menggantung tanpa identitas canonical — dan **tidak ada proses yang menautkannya belakangan** setelah customer itu akhirnya muncul di import. ⚪ perlu query untuk mengukur berapa baris menggantung.

---

# H. UI/UX

- ✅ Tabel besar seragam di atas `DataTable` (TanStack + virtualisasi).
- ✅ Nomor HP tidak pernah di-truncate (aturan eksplisit di kode).
- ✅ Filter tersimpan di URL → back/forward berfungsi.
- ✅ Empty state & skeleton tersedia.
- ⚠️ **Dua gaya pagination**: analytics (infinite scroll) vs Pembagian Tugas (halaman bernomor). Tidak salah, tapi tidak konsisten.
- ⚠️ Header checkbox hanya memilih baris **yang sudah dimuat**, bukan seluruh hasil filter — aman (pola Gmail) tapi mudah disalahpahami saat ada 38.136 baris.
- ⚠️ KPI Customers "Belum Masuk Grup" menampilkan sisipan `Unknown: N` di subteks — informasi UNKNOWN mudah terlewat.

---

# I. DATE & PERIOD AUDIT

**Temuan utama: ada DUA rezim tanggal yang tidak sama.**

| Aspek | Rezim Analytics | Rezim Workspace |
|---|---|---|
| File | `components/filters/date-range-filter.tsx` | `server/workspace/date.ts` |
| Sumber "hari ini" | `new Date()` — **jam browser** | `todayInJakarta()` — **Intl + Asia/Jakarta** |
| Batas akhir | inklusif (`order_date <= to`) | **eksklusif** (`endExclusive = to + 1 hari`) |
| Timezone | tidak ada konversi (kolom `date`) | eksplisit `+07:00` |
| Validasi range | tidak ada | `assertBusinessDate`, tolak `from > to` |

Detail per halaman:

| Halaman | Punya kalender | Field yang difilter | Memengaruhi |
|---|---|---|---|
| Dashboard | ✅ | `orders.order_date` | Hanya "Nilai order" + 2 chart tren |
| Customers | ✅ | `EXISTS(orders.order_date BETWEEN from AND to)` | Tabel + total. **Tidak** memengaruhi KPI (KPI sengaja global) |
| Group Membership | ✅ | idem Customers | Tabel |
| Pembagian Tugas | ✅ | ⚪ belum ditelusuri sampai kolom | Tabel task |
| Workspace Overview / Pesanan / Biaya | ✅ | `order_date` / `cost_date`, rezim Jakarta | KPI + tabel |
| RFM / Cohort / Frequency / Cluster | ❌ **tidak ada** | — | — (disengaja, Q16) |

**Kesimpulan tanggal:**
- ✅ Tidak ditemukan off-by-one pada rezim analytics: perbandingan `>= from` / `<= to` terhadap kolom bertipe `date` (tanpa jam) memang inklusif dua sisi.
- ✅ Rezim Workspace benar dan lebih ketat (end-exclusive pada timestamp — pola yang tepat).
- ✅ `formatDate` memakai `timeZone: "UTC"` atas string `YYYY-MM-DD` → tidak ada pergeseran hari saat render.
- ❌ **BUG-04**: preset dihitung dari waktu nyata, bukan `as_of_date`.
- ⚠️ Tidak ada validasi `from > to` di rezim analytics (rezim Workspace punya).
- ⚪ 29 Feb / pergantian tahun: tidak diuji. Karena preset memakai aritmetika `Date` bawaan JS dan query memakai tipe `date` Postgres, risikonya rendah, tapi **belum dibuktikan**.

---

# J. PERFORMANCE

**Sudah baik ✅**
- Cursor/keyset pagination pada seluruh daftar customer (`CURSOR_ORDER`, `encodeCursor`) — bukan OFFSET.
- `COUNT(*)` hanya dijalankan pada batch pertama.
- Virtualisasi baris (`@tanstack/react-virtual`).
- Debounce 350 ms + stale-request cancellation (`requestId` di `useInfiniteRows`).
- R/F/M dibaca dari tabel pra-agregat `customer_rfm_current`, tidak dihitung per baris.
- `getDatasetContext()` di-cache per-request (React `cache()`) + `cachedAggregate`.
- Retention query sudah dioptimasi (catatan di kode: 18 s → 0,1 s dengan menghapus correlated EXISTS).

**Masalah ⚠️**
- **BUG-05**: bulk action = N×2 round trip sekuensial (diperkenalkan redesign terakhir).
- **Halaman Customers menambah 3 query berat per load** (redesign terakhir): dua `loadCustomerList(perPage:1)` untuk KPI Total & Customer Baru — masing-masing tetap menjalankan `COUNT(*)` atas join penuh 5 tabel — plus `loadMembershipSummary` (5 subquery COUNT). ⚪ dampak milidetiknya belum diukur.
- Subquery `cs_names` dan `first_order_division` dievaluasi per baris pada `listCustomers` (60 baris/batch → 120 subquery per batch). Bukan N+1 klasik (satu round trip), tapi tetap biaya nyata.

---

# K. SECURITY — ✅ SEHAT

- **Seluruh 100 server action ber-guard.** Diverifikasi dengan mencocokkan jumlah `export async function` vs jumlah `await require*`/`actor()` di 14 file action. File yang awalnya tampak kurang (`workspace-cost-actions`) ternyata mendelegasikan ke helper ber-guard bersama (`:44`).
- Dua lapis: `middleware.ts` (per-path) + guard di dalam setiap action. Rasionalnya terdokumentasi dengan benar: action ID Next.js bersifat global sehingga middleware saja tidak cukup.
- 258 test keamanan (`tests/server-action-security.test.ts`) memverifikasi MANAGEMENT tidak bisa membaca PII dan guard berjalan **sebelum** DB tersentuh (DB di-mock agar melempar).
- Permission granular `crm.*` + `roleHasCrmPermission` untuk modul Workspace; `requireRole` untuk modul customer.
- Export broadcast ber-guard `requireRole("ADMIN","CRM")`.
- Kredensial E2E gitignored, tidak ada password di source.

**Catatan:** `crm.customer.*` yang disebut dalam spec **tidak ada** — modul customer memakai role-based (`ADMIN`/`CRM`), bukan permission-based. Bukan lubang keamanan, hanya penamaan yang berbeda dari ekspektasi.

---

# L. SSOT ISSUES

### SSOT-01 — Transaksi punya TIGA sumber
- **Data:** transaksi/penjualan
- **Source A:** `orders` + `order_items` (canonical; sumber RFM/Cohort/Cluster)
- **Source B:** `workspace_orders` + `workspace_order_items` (Pesanan CRM; sumber Sales/COS Workspace)
- **Source C:** `crm_reports` + `crm_report_items` (laporan closing legacy)
- **Impact:** Tiga angka penjualan yang tidak pernah dijumlahkan/direkonsiliasi satu sama lain. Analisis pelanggan buta terhadap B dan C.
- **Expected canonical:** `orders`. B dan C seharusnya bermuara ke sana (atau ada view penyatu).

### SSOT-02 — Produk punya DUA master
- **Source A:** `products` + `product_aliases` (canonical import/mapping)
- **Source B:** `workspace_products` (Master Produk, dengan `productId` PRO-0001, HPP, usage)
- **Impact:** **Tidak ada foreign key antara keduanya.** `workspace_order_items.productId` menunjuk `workspace_products`; `order_items.productId` menunjuk `products`. Produk yang sama bisa punya dua identitas dan dua harga tanpa ada yang memaksa konsisten.
- **Expected canonical:** satu tabel produk, atau FK eksplisit `workspace_products.canonical_product_id → products.id`.

### SSOT-03 — Identitas customer (✅ SEHAT)
- Source tunggal `customers.normalized_phone` (UNIQUE). `workspace_orders`/`crm_reports` menyimpan snapshot nama/HP **secara sengaja** (terdokumentasi) dengan `customer_id` sebagai tautan best-effort. Ini pola yang dapat dibenarkan.

---

# M. SCOPE DRIFT — **YA, SUDAH MULAI MELENCENG**

| Fitur | Kategori | Alasan |
|---|---|---|
| Import / Normalize / Staging | **CORE** | Fondasi seluruh analisis |
| RFM / Cohort / Frequency | **CORE** | Inti Customer Intelligence |
| Cluster A1–F | **CORE** | Aturan segmentasi perusahaan |
| Customers + drill-down | **CORE** | Titik temu analisis & aksi |
| Group Membership | **CORE** | Input rule cluster (has_group) |
| Export Broadcast | **CORE** | Output aksi dari analisis |
| Pembagian Tugas | **CORE** | Jembatan analisis → kerja CRM |
| Data Quality / Mapping | **SUPPORTING** | Menjaga kualitas input analisis |
| Reconciliation / History / Rules | **SUPPORTING** | Auditability |
| Users/Auth | **SUPPORTING** | Wajib |
| Pesanan (form order lengkap: ekspedisi, hub, COD, packing, voucher, mitra) | **QUESTIONABLE** | CRM perlu mencatat closing; tapi ini sudah setara modul Order Management penuh |
| Master Produk (HPP, usage, alias, export) | **QUESTIONABLE** | Diperlukan untuk COS — tapi menduplikasi `products` (SSOT-02) |
| Biaya Operasional + approval 4 tingkat (draft→submit→leader→spv→director) | **OUT OF SCOPE** | Ini modul *expense approval workflow* perusahaan. Tidak ada hubungannya dengan Customer Intelligence; tidak memengaruhi satu pun angka RFM/Cluster |
| Workspace Overview (Sales/COS/COM/Pendapatan Bersih) | **OUT OF SCOPE** | Ini laporan **laba-rugi**, bukan customer intelligence |

**Mulai melenceng dari mana:** dari commit `026768a` *"complete Workspace CRM V1 (Pesanan, Master Data, Biaya Operasional)"* dan berlanjut di `093e986`.

**Penyebab:** kebutuhan menghitung **profitabilitas** (Pendapatan Bersih) ditempelkan ke aplikasi customer intelligence, sehingga menyeret masuk master produk, HPP, biaya operasional, dan rantai approval.

**Dampak:** bobot pengembangan bergeser ke akuntansi operasional, sementara lubang paling penting di jalur CORE (BUG-01: transaksi tidak kembali ke RFM) belum tertutup.

---

# N. CURRENT END-TO-END FLOW (aktual)

```
Database All (Excel/CSV)
   ↓ parse → validate → normalize → staging → commit  ✅
customers + orders + order_items                       ✅
   ↓ rebuildRfm() + rebuildClusters()  (dalam 1 transaction)
customer_rfm_current + customer_cluster_current        ✅
   ↓
Dashboard / RFM / Cohort / Frequency / Cluster         ✅
   ↓ drill-down (semua bermuara ke /customers?filter)  ✅
Customers                                              ✅
   ├─→ Export Broadcast (CSV/XLSX)  ──→ [KELUAR SISTEM] ⚠️ tanpa status balik
   └─→ "Masukkan ke Pembagian Tugas" (manual)          ✅
            ↓
detectNewCustomersFromBatch (otomatis, TAPI hanya divisi CRM) ⚠️
            ↓
crm_tasks → assign PIC → IN_PROGRESS → DONE + outcome  ✅
            ├─ outcome JOINED_GROUP → membership GROUPED
            │        → recalculateClusterForCustomer   ✅ LOOP TERTUTUP
            └─ outcome CLOSING → crm_reports / workspace_orders
                     ↓
              workspace_orders (Sales, COS)            ✅
                     ↓
              Workspace Overview (laba)                 ✅
                     ↓
              ┌──────────────────────────────┐
              │  ❌ PUTUS — tidak ada jalur   │
              │  kembali ke `orders`/RFM      │
              └──────────────────────────────┘
```

# O. EXPECTED END-TO-END FLOW

Sama seperti di atas, **kecuali** panah terakhir seharusnya:

```
workspace_orders (closing CRM)
   → tercatat juga sebagai order kanonik (atau view penyatu)
   → ikut terhitung rebuildRfm()
   → R/F/M customer berubah
   → cluster berpindah (mis. D-New → A1)
   → analisis berikutnya melihat hasil kerja CRM     ✅ LINGKARAN TERTUTUP
```

# P. GAP ANALYSIS

| # | CURRENT | EXPECTED | GAP | IMPACT | PRIORITY |
|---|---|---|---|---|---|
| 1 | Closing CRM hanya di `workspace_orders` | Ikut jadi order kanonik | Tidak ada jalur tulis Workspace→`orders` | RFM/Cluster tertinggal dari kenyataan | **P0** |
| 2 | Auto-task hanya divisi CRM | Semua customer baru jadi kandidat | Filter `is_crm_transaction` | Mayoritas customer baru tak tergarap otomatis | **P1** |
| 3 | "Customer Baru" = per batch | Bisa per periode | Definisi terikat `first_seen_batch_id` | Daftar hilang tiap import | **P1** |
| 4 | Broadcast = export file | Ada status/riwayat kirim | Tidak ada tabel broadcast | Tidak terukur, bisa ganda | **P1** |
| 5 | `products` vs `workspace_products` | Satu master produk | Tidak ada FK | Harga/HPP bisa menyimpang | **P2** |
| 6 | Eligible customers salah hitung | Hanya 14 cluster resmi | `IS DISTINCT FROM` | KPI overstated | **P2** |
| 7 | Preset kalender pakai waktu nyata | Pakai `as_of_date` | `new Date()` | Preset terasa rusak | **P2** |
| 8 | Bulk action N×2 sekuensial | Satu action massal | Orkestrasi di client | Lambat/timeout | **P2** |

---

# Q. CUSTOMER JOURNEY — TITIK PUTUS

```
Import ✅ → Analysis ✅ → Customer ✅ → Broadcast ⚠️(export saja, tanpa status)
   → Task ⚠️(otomatis hanya divisi CRM) → Follow-up ✅ → Order ✅(workspace_orders)
   → Analysis berikutnya ❌ PUTUS
```

Dua titik putus:
1. **Broadcast → status:** keluar sistem, tidak ada jejak balik.
2. **Order → Analysis:** ❌ **putus total** — hanya tersambung lewat putaran manual re-import.

---

# R. FINAL VERDICT

| # | Pertanyaan | Jawaban |
|---|---|---|
| 1 | Konsep aplikasi masih benar? | **Ya** untuk inti analitik; **tidak utuh** karena lingkaran terputus |
| 2 | Masih fokus RFM + Workspace CRM? | Sebagian. Workspace mulai jadi modul keuangan/ERP |
| 3 | Dashboard benar? | ⚠️ Benar kecuali BUG-03 (eligible) + filter tanggal parsial |
| 4 | Analysis benar? | Tidak ada halaman "Analysis" tersendiri — RFM/Cohort/Frequency/Cluster. Tidak ada duplikasi |
| 5 | RFM benar? | ✅ Formula benar: R = as_of_date − MAX(order_date); F = COUNT(orders); M = SUM(order_total). `as_of_date` bukan NOW() |
| 6 | Frequency benar? | ✅ Konsisten dengan F di RFM (sumber sama) |
| 7 | Cohort benar? | ✅ cohort_month = date_trunc('month', first_order_date) |
| 8 | Cluster benar? | ✅ Engine murni, first-match-wins, 14 cluster + 3 non-cluster, reason tersimpan |
| 9 | Customers benar? | ✅ Data & kolom benar |
| 10 | Customer Baru benar? | ⚠️ Benar mencegah repeat, **tapi** per-batch dan hilang tiap import (LOGIC-01) |
| 11 | Broadcast flow benar? | ⚠️ **Sistem hanya MENYIAPKAN/EXPORT target broadcast. TIDAK ADA pengiriman WhatsApp/SMS apa pun.** Tanpa status/riwayat |
| 12 | Membership benar? | ✅ Current vs history terpisah; `no row = NOT_GROUPED` konsisten |
| 13 | Import benar? | ✅ Idempoten, population gate (nama + HP valid + ≥1 transaksi) masih berlaku |
| 14 | Pembagian Tugas benar? | ⚠️ Mekanik benar; **pemicu otomatisnya terlalu sempit** (BUG-02) |
| 15 | Pesanan benar? | ✅ Anti-duplikat kuat; ⚠️ tidak menyuburkan RFM |
| 16 | Master Produk sesuai scope? | ⚠️ QUESTIONABLE — perlu untuk COS, tapi duplikat `products` |
| 17 | Biaya Operasional sesuai scope? | ❌ **OUT OF SCOPE** untuk Customer Intelligence |
| 18 | Workspace terhubung dengan Analysis? | **Sebagian.** Masuk: customer/task ✅. Keluar: hanya JOINED_GROUP ✅; transaksi ❌ |
| 19 | SSOT sudah benar? | ⚠️ Customer ✅; transaksi ❌ (3 sumber); produk ❌ (2 master) |
| 20 | Rentang tanggal seluruh aplikasi benar? | ⚠️ Dua rezim berbeda; tidak ada off-by-one; ada BUG-04 |
| 21 | Perubahan terbaru menyebabkan regression? | **Tidak ada regression logic.** Redesign Customers murni UI (diverifikasi: nol perubahan di `src/server/**`, `customers-actions.ts`, `customer-types.ts`). **Tapi** memperkenalkan 2 isu performa (BUG-05 + 3 query KPI tambahan) |
| 22 | Ada fitur tidak berguna? | `CohortHeatmap` (dead code, nol import); `EXCLUDED_NO_PHONE` (didefinisikan tapi tidak pernah di-assign engine) |
| 23 | Ada duplicate logic? | Ya: `products`/`workspace_products`; dan `orders`/`workspace_orders`/`crm_reports` |
| 24 | Siap diteruskan? | **Ya.** Fondasi kuat, security solid, test 574 hijau. Yang kurang adalah **penutupan lingkaran**, bukan perbaikan fondasi |
| 25 | Kesalahan arsitektur terbesar? | **Workspace dibangun sebagai pulau data terpisah.** `workspace_orders` sejajar, bukan menyuburkan, `orders`. Akibatnya aplikasi punya dua kebenaran tentang "penjualan" dan hasil kerja CRM tidak pernah kembali ke analisis |
| 26 | Urutan perbaikan yang disarankan | Lihat di bawah |

### Urutan perbaikan yang disarankan (belum dikerjakan — audit saja)

1. **P0** — Putuskan & implementasikan jalur `workspace_orders → orders` (atau view penyatu) agar RFM melihat hasil kerja CRM.
2. **P1** — Lebarkan `detectNewCustomersFromBatch` melampaui `is_crm_transaction`, atau jadikan divisi sebagai parameter kebijakan.
3. **P1** — Tambah definisi "Customer Baru" berbasis periode (`first_order_date` dalam rentang) berdampingan dengan yang berbasis batch.
4. **P1** — Catat status/riwayat broadcast (minimal: batch export + timestamp per customer).
5. **P2** — Perbaiki BUG-03 (eligible customers), BUG-04 (preset kalender), BUG-05 (bulk action).
6. **P2** — Satukan master produk (FK `workspace_products → products`).
7. **P3** — Putuskan nasib Biaya Operasional: pisahkan ke aplikasi lain, atau terima resmi sebagai perluasan scope dan dokumentasikan.

---

**Akhir laporan. Tidak ada file kode, query, schema, atau data yang diubah oleh audit ini.**
