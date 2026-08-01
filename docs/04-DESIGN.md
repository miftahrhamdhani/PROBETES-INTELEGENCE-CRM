# Technical Design V1

---

## 1. Arsitektur

```
                        VERCEL
 ┌────────────────────────────────────────────┐
 │                 NEXT.JS 15                 │
 │                                            │
 │  Browser                                   │
 │   ├─ SheetJS / PapaParse   (parse file)    │
 │   └─ shadcn/ui + Recharts  (UI)            │
 │                                            │
 │  Server (Route Handlers / Server Actions)  │
 │   ├─ Import orchestrator                   │
 │   ├─ Normalizer                            │
 │   └─ Cluster rule engine (TypeScript)      │
 └───────────────────┬────────────────────────┘
                     │  @neondatabase/serverless
                     ▼
              NEON POSTGRESQL
                     │
              SQL Analytics
        ┌────────────┼────────────┐
        ▼            ▼            ▼
       RFM        Cohort      Frequency
```

**Pembagian tanggung jawab**

| Di SQL (Neon) | Di TypeScript |
|---|---|
| RFM aggregate | Orchestration import |
| Cohort & retention matrix | Normalisasi (phone, produk, tanggal, uang) |
| Frequency distribution & funnel | **Cluster rule engine** |
| Revenue rollup | Validasi & data quality |

Alasan cluster engine di TypeScript: harus bisa di-unit-test sebagai fungsi murni,
dan hanya berjalan atas ±20 ribu baris agregat (bukan 35 ribu baris mentah).

---

## 2. Pipeline import

### 2.1 Kenapa tidak upload satu request

Vercel membatasi request body ±4,5 MB, sementara file `.xlsx` produksi 18,8 MB.
Ditambah parsing + insert + rebuild dalam satu request pasti kena batas durasi.

### 2.2 Alur

```
1. SELECT FILE
   └─ browser hitung SHA-256 → cek ke server
      └─ hash sudah pernah COMPLETED? → peringatkan user

2. PARSE DI BROWSER  (SheetJS)
   ├─ baca sheet `allbaru` saja
   ├─ kolom No. HP dibaca sebagai TEKS (raw:false)   ← wajib
   ├─ lewati baris rumus pertama setelah header
   └─ cek kolom wajib ada

3. CREATE IMPORT BATCH  → status UPLOADING

4. UPLOAD CHUNK  1.000–2.000 baris/request
   └─ masuk staging_import_rows (raw_data JSONB)
   → status STAGED

5. VALIDASI SERVER
   ├─ normalisasi phone / produk / tanggal / uang
   ├─ resolve product alias
   ├─ tandai issue → data_quality_issues
   └─ hitung as_of_date = MAX(order_date valid)

6. PREVIEW  → user melihat ringkasan & issue

7. COMMIT  (user klik)
   └─ advisory lock
      ├─ upsert customers / orders / order_items
      ├─ SQL: RFM
      ├─ SQL: Cohort
      ├─ SQL: Frequency
      ├─ TS : Cluster engine
      ├─ tulis cluster_history bila berubah
      └─ set batch.is_active = true (atomic)
   → status COMPLETED
```

### 2.3 Idempotensi

Kunci: `orders.source_order_key` UNIQUE.

```sql
INSERT INTO orders (...) VALUES (...)
ON CONFLICT (source_order_key) DO UPDATE
SET order_total = EXCLUDED.order_total,
    updated_at  = now()
WHERE orders.order_total IS DISTINCT FROM EXCLUDED.order_total;
```

| Kondisi | Aksi |
|---|---|
| Order belum ada | INSERT |
| Order ada, isi sama | tidak ada perubahan |
| Order ada, isi berubah | UPDATE + catat di `data_quality_issues` sebagai koreksi |
| Order ada di DB, hilang dari file | **dibiarkan** — data lama tidak pernah dihapus |

> Database All diperlakukan **full snapshot**, tetapi baris yang hilang tidak
> menghapus data lama. Ini keputusan eksplisit pemilik proses.

### 2.4 Commit atomic

```
Dashboard membaca batch dengan is_active = true

Batch 11 diproses → is_active tetap di Batch 10
Batch 11 sukses   → transaksi: batch10.is_active=false, batch11.is_active=true
Batch 11 gagal    → is_active tetap Batch 10, batch11.status=FAILED
```

Tidak pernah ada kondisi dashboard separuh data lama separuh baru.

### 2.5 Lock

```sql
SELECT pg_try_advisory_lock(918273645);
```
Jika gagal → `409 Another calculation is currently running.`

---

## 3. Normalisasi

### 3.1 Nomor HP

```
input  → buang semua non-digit
       → buang akhiran ".0" (artefak float Excel)
       → "0…"   → "62" + sisa
       → "8…"   → "62" + seluruhnya
       → "620…" → "62" + sisa setelah 0
       → sudah "62…" → biarkan

valid bila: diawali "628" DAN panjang 10–15 digit
```

| Input | Output | Status |
|---|---|---|
| `0812 3456 7890` | `6281234567890` | VALID |
| `+62 812-3456-7890` | `6281234567890` | VALID |
| `6282223639545.0` | `6282223639545` | VALID |
| `81234567890` | `6281234567890` | VALID |
| kosong | — | `MISSING_PHONE` |
| 26 digit | — | `INVALID_PHONE` |

Kolom ini **wajib** dibaca sebagai teks dari Excel. Jika dibiarkan jadi angka,
nomor panjang berubah jadi notasi ilmiah dan **rusak permanen**.

### 3.2 Nama produk

```
replace   (nbsp) → spasi
rapatkan spasi ganda
trim
uppercase
```
Ini saja memangkas 132 → 110 varian. Sisanya lewat `product_aliases`.

Alias belum dikenal → produk `UNKNOWN`, issue `UNKNOWN_PRODUCT`,
dan customer terdampak → `NEEDS_REVIEW`. **Import tetap jalan.**

Sistem boleh memberi **saran** mapping (fuzzy/token match) di kolom
`suggested_product_id`, tetapi tidak pernah dipakai sebelum admin approve.

### 3.3 Uang

```
"Rp 1.500.000" / "1.500.000" / "1,500,000" / 1500000.0  →  1500000  (bigint)
```
Deteksi pemisah ribuan vs desimal berdasarkan posisi & panjang grup.

### 3.4 Tanggal

Excel serial date maupun `datetime` → `date` (tanpa jam).
Timezone acuan **Asia/Jakarta**. Di luar rentang wajar (< 2020 atau > as_of + 1 hari)
→ `INVALID_DATE`.

### 3.5 Teks lain

`CS`, `Mitra`, `Platform`, `DIVISI` → trim + uppercase untuk matching,
tetapi **display name tetap bentuk kanonik yang rapi**.

---

## 4. Pembentukan order

> ✅ **Terverifikasi dari kode sumber sistem lama:** Frequency = jumlah **hari unik**
> customer bertransaksi, bukan jumlah `idpesan` unik. Lihat
> [02-CLUSTER-RULES.md §3.2](02-CLUSTER-RULES.md) untuk pembuktian angka.

```
order_key = `${order_date}|${normalized_phone}`        -- SATU HARI = SATU ORDER
```

Semua baris Database All di hari yang sama untuk customer yang sama digabung jadi
**satu** `orders` row dengan banyak `order_items`. `idpesan` asli tiap baris tetap
disimpan di `order_items.external_id` untuk audit/ketertelusuran, tapi **tidak**
dipakai untuk uniqueness atau Frequency.

Baris yang datang di hari yang sama tapi tanpa `idpesan` sama sekali tetap masuk
`order_items` dengan `identity_confidence = LOW` dan issue `MISSING_ORDER_ID` —
ini hanya mempengaruhi ketertelusuran per-item, bukan penghitungan Frequency.

`order_total = SUM(amount seluruh item Probetes non-KSB dalam order hari itu)`

`AMOUNT_CONFLICT` di-flag hanya bila ada dua baris **identik**
(produk + qty + nilai sama) dalam satu order — indikasi duplikasi sungguhan.

Transaksi KSB (Yacona, Teacona, Bio Insuleaf, dll) **tidak masuk** tabel `orders`
sama sekali — itu tabel `ksb_transactions` yang diisi dari upload terpisah
(`source_type = KSB`), hanya dipakai untuk Cluster B. Lihat [03-ERD.md](03-ERD.md).

---

## 5. Perhitungan analitik

### 5.1 as_of_date
```sql
SELECT MAX(order_date) FROM orders WHERE source_batch_id IN (batch aktif);
```
Dipakai seluruh perhitungan. **Tidak boleh `NOW()`.**

### 5.2 RFM (SQL)

`orders` hanya berisi transaksi Probetes (KSB sudah di tabel terpisah sejak import,
lihat [03-ERD.md](03-ERD.md)), jadi tidak perlu filter `contains_yacona` di sini:

```sql
INSERT INTO customer_rfm_current (
  customer_id, as_of_date, recency_days, frequency, monetary,
  first_order_date, last_order_date, avg_order_value,
  customer_age_days, yacona_frequency, cohort_month
)
SELECT
  o.customer_id,
  :as_of_date,
  :as_of_date - MAX(o.order_date),
  COUNT(DISTINCT o.id),                 -- 1 order = 1 hari, lihat §4
  COALESCE(SUM(o.order_total), 0),
  MIN(o.order_date),
  MAX(o.order_date),
  ...,
  COALESCE(ksb.freq, 0),                -- dari tabel ksb_transactions, JOIN by phone
  to_char(MIN(o.order_date), 'YYYY-MM')
FROM orders o
LEFT JOIN (
  SELECT customer_phone, COUNT(DISTINCT transaction_date) AS freq
  FROM ksb_transactions GROUP BY customer_phone
) ksb ON ksb.customer_phone = (SELECT normalized_phone FROM customers WHERE id = o.customer_id)
GROUP BY o.customer_id, ksb.freq
ON CONFLICT (customer_id) DO UPDATE SET ...;
```

`yacona_frequency` (dipakai Cluster B) dihitung dari `ksb_transactions`, bukan dari
`orders` — lihat [02-CLUSTER-RULES.md §3.1](02-CLUSTER-RULES.md).

### 5.3 Cohort & Retention (SQL)
```
cohort_month = bulan first eligible Probetes purchase
Mn           = selisih bulan kalender antara order_date dan cohort_month
retention    = customer aktif di Mn ÷ ukuran cohort
```
M0 selalu 100% — **dihitung**, bukan di-hardcode.
Bulan berjalan diberi flag `PARTIAL`.

### 5.4 Frequency — dua metrik BERBEDA

| Metrik | Definisi | Visual |
|---|---|---|
| **Frequency Distribution** | customer dengan total order **tepat** N | Bar chart |
| **Repeat Purchase Funnel** | customer yang **mencapai** order ke-N, per cohort | Heatmap |

Jumlah F1 di funnel = ukuran cohort. Label tidak boleh tertukar.

### 5.5 Cluster engine (TypeScript)

Fungsi murni:
```ts
assignCluster(features: CustomerFeatures, ctx: ClusterContext): ClusterAssignment
```
- `features` — hasil agregat SQL, tanpa akses DB
- `ctx` — `{ asOfDate, ruleVersion }`
- Tanpa `Date.now()`, tanpa I/O → deterministik & bisa dites

Urutan evaluasi mengikuti [02-CLUSTER-RULES.md §2](02-CLUSTER-RULES.md).
Setiap aturan mengembalikan daftar `checks` untuk fitur "Why this cluster?".

---

## 6. Struktur folder — backend vs frontend dipisah tegas

Satu project Next.js, satu deployment Vercel. **Bukan** dua service/repo terpisah —
tapi batas folder dijaga ketat agar backend tetap testable tanpa render UI sama sekali.

```
src/
  server/                       ★ BACKEND — tanpa React, tanpa 'use client'
    db/
      schema.ts                 seluruh tabel Drizzle (lihat 03-ERD.md)
      client.ts                 koneksi Neon (pooled)
      queries/                  query per domain (customers.ts, orders.ts, ...)
    normalize/
      phone.ts  product.ts  amount.ts  date.ts  text.ts
    cluster/
      types.ts                  CustomerFeatures, ClusterAssignment, ClusterContext
      features.ts               bangun CustomerFeatures dari hasil agregat SQL
      engine.ts                 assignCluster() — fungsi murni, first-match-wins
      rules/                    satu file per cluster: a1.ts, b.ts, c-prodig.ts, ...
    import/
      parser.ts                 baca sheet 'allbaru', validasi kolom
      validator.ts              deteksi issue (missing phone, unknown product, ...)
      orchestrator.ts           staging → canonical → rebuild analytics (transaksional)
    analytics/
      rfm.ts  cohort.ts  frequency.ts     penyusun query SQL agregat
    auth/
      session.ts  rbac.ts

  app/                          ★ FRONTEND (routes) + API tipis
    (auth)/login/
    (dashboard)/
      page.tsx                  Dashboard
      cohort/  frequency/  rfm/  cluster/
      customers/  groups/
      import/  mapping/  quality/  history/
      rules/  users/
    api/
      import/{init,chunk,validate,commit}/route.ts   → panggil src/server/import/*
      export/cluster/route.ts                        → panggil src/server/*
      (route.ts HANYA: parse request → panggil server → format response)

  components/                   ★ FRONTEND — komponen UI murni
    ui/                         shadcn primitives
    charts/                     Recharts wrapper
    heatmap/                    custom CSS Grid
    customer-sheet/
    data-table/                 TanStack Table + styling shadcn

  lib/                          ★ SHARED — tipe & konstanta, tanpa I/O
    cluster-codes.ts            konstanta 'A1' | 'A2' | ... (dipakai server & UI)
    format.ts                   format rupiah/tanggal untuk tampilan

scripts/
  validate-against-file.ts      jalankan src/server/cluster & import atas Excel asli
  seed-products.ts              seed canonical product + alias

tests/
  cluster.test.ts               21+ skenario wajib — hanya import src/server/cluster
  normalize.test.ts
```

**Kenapa begini:** cluster engine, normalisasi, dan query DB (`src/server/**`) harus
bisa dites dan di-`validate:legacy` tanpa menyalakan Next.js dev server sama sekali.
UI (`src/app/**/page.tsx`, `src/components/**`) tidak pernah mengimpor `src/server/db`
langsung — semua lewat Server Action atau `route.ts` yang tipis.

---

## 7. Performa

| Aspek | Angka |
|---|---|
| Baris file | 35.189 |
| Order terbentuk | 30.483 |
| Customer | 19.734 |
| Chunk upload | 1.000–2.000 baris → ±20 request |
| RFM/Cohort di Postgres | hitungan detik |
| Cluster engine 20k customer di TS | < 1 detik |
| Estimasi ukuran DB | ±100 MB (muat di Neon free tier) |

Titik terberat justru **retensi `staging_import_rows`** — wajib ada kebijakan
pembersihan (lihat [03-ERD.md](03-ERD.md)).

---

## 8. Keamanan

- Auth.js, tanpa registrasi publik, role ADMIN/CRM/MANAGEMENT
- Data berisi PII (nama, nomor HP, riwayat transaksi) — **tidak boleh deploy tanpa auth**
- Middleware memproteksi seluruh route kecuali `/login`
- Export CSV dicatat: siapa, cluster apa, kapan, berapa baris
- `DATABASE_URL` hanya di environment variable, tidak pernah di client bundle
