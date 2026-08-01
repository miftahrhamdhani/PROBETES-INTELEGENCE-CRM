# PRD — PROBETES Customer Intelligence V1

**Versi** 1.0 · **Tanggal** 30 Juli 2026 · **Status** Approved for build

---

## 1. Latar belakang

Proses saat ini:
```
Spreadsheet → Update Manual → BigQuery → Apps Script → Dashboard
```
Rapuh, lambat, bergantung orang tertentu, dan sulit diaudit.

Proses yang dituju:
```
Upload Database All → Preview → Commit → Dashboard berubah otomatis
```

---

## 2. Objective

Mengolah **Database All** secara otomatis dan deterministik menjadi:
Customer · RFM · Frequency · Cohort · Retention · **Cluster Probetes A1–F**

Tanpa ketergantungan manual pada Spreadsheet, Apps Script, maupun BigQuery.

### Non-goal V1
Machine learning, prediksi churn, next-best-product, customer scoring, rule-builder
visual generik, integrasi WhatsApp/blast otomatis.

---

## 3. Pengguna & hak akses

| Role | Kemampuan |
|---|---|
| **ADMIN** | Import, product mapping, group management, recalculate, kelola user, seluruh analitik |
| **CRM** | Lihat & cari customer, cluster, group, detail customer, **export daftar broadcast** |
| **MANAGEMENT** | Dashboard, Cohort, RFM, Cluster analytics, download report |

Tidak ada registrasi publik. Akun dibuat admin.

---

## 4. Alur utama

> ✅ Terverifikasi dari sistem lama: perhitungan cluster butuh **tiga sumber upload**,
> bukan satu — lihat [08-RECONCILIATION.md §1](08-RECONCILIATION.md) dan
> [07-OPEN-QUESTIONS.md Q12](07-OPEN-QUESTIONS.md).

```
Database All        DataKSB              masukWA/BackupMasukGrup
(.xlsx/.csv)         (.xlsx/.csv)         (.xlsx/.csv)
transaksi Probetes   transaksi KSB        daftar nomor masuk Grup
        │                  │                       │
        ↓                  ↓                       ↓
   Upload & parsing di browser (SheetJS/PapaParse, sama untuk ketiganya)
        │                  │                       │
        ↓                  ↓                       ↓
   Staging di Neon + validasi server (masing-masing import_batch sendiri)
        │                  │                       │
        ↓                  ↓                       ↓
   PREVIEW  (rows, valid, issue)
        │                  │                       │
        ↓                  ↓                       ↓
   User klik Commit
        ↓                  ↓                       ↓
   orders/order_items  ksb_transactions   customer_group_memberships
        └──────────────────┴───────────────────────┘
                            ↓
        Atomic rebuild: canonical → RFM → Cohort → Frequency → Cluster
                            ↓
                Activate dataset → Dashboard berubah
```

Tiga upload ini independen — mengupload Database All baru tidak mengharuskan
upload ulang DataKSB atau daftar Grup, begitu pula sebaliknya. Recalculate selalu
memakai batch aktif terakhir dari masing-masing sumber.

---

## 5. Functional Requirements

### Import & data

| ID | Requirement |
|---|---|
| FR-01 | Menerima `.xlsx` dan `.csv` |
| FR-02 | Preview sebelum commit: total rows, valid, missing phone, invalid phone, missing order ID, unknown product, duplicate order, amount conflict, as_of_date |
| FR-03 | Customer tanpa No. HP → `EXCLUDED_NO_PHONE`, tidak masuk RFM/Cohort/Cluster |
| FR-04 | Normalisasi No. HP ke bentuk kanonik `628xxxxxxxxx` |
| FR-05 | Normalisasi nama produk → canonical product via `product_aliases` |
| FR-06 | Identitas customer = `normalized_phone`, bukan nama |
| FR-07 | Order unik = `(order_date, normalized_phone)` — **satu hari = satu order**, sesuai definisi Frequency sistem lama (dikonfirmasi dari kode sumber legacy). `idpesan` asli tetap disimpan di `order_items` untuk audit, tidak dipakai untuk uniqueness. Lihat [02-CLUSTER-RULES.md §3.2](02-CLUSTER-RULES.md) |
| FR-18 | Halaman Data Quality: missing phone, invalid phone, missing order ID, duplicate order, unknown product, amount conflict, invalid date, needs review — angka dapat diklik ke baris sumber |
| FR-19 | Import idempoten: file sama diupload 2× → state identik. Deteksi via `file_hash` |
| FR-20 | Commit bersifat atomic. Dashboard tetap memakai batch lama sampai batch baru sukses |
| FR-21 | Advisory lock: hanya satu import/recalculate berjalan pada satu waktu |
| FR-28 | Jalur upload terpisah untuk **DataKSB** (transaksi Yacona/Teacona/Bio Insuleaf/Zymuno/Nutriflakes/Probiogel) — sumber tunggal Cluster B, tidak digabung ke `orders` |
| FR-29 | Jalur upload terpisah untuk **daftar Grup** (nomor HP + nama, dari `masukWA`/`BackupMasukGrup`) — sumber `has_group`, dengan opsi override manual per customer |

### Analitik

| ID | Requirement |
|---|---|
| FR-08 | RFM: recency, frequency, monetary, first/last order, AOV, customer age, yacona_frequency |
| FR-09 | Cohort berdasarkan bulan first eligible Probetes purchase |
| FR-10 | Retention M0..Mn, heatmap, bulan berjalan diberi label `PARTIAL` |
| FR-11 | **Frequency Distribution** (eksklusif: F1/F2/F3/F4/F5+) — berbeda dari **Repeat Purchase Funnel** (kumulatif per cohort). Label wajib dibedakan |
| FR-12 | Cluster rule engine A1–F, deterministik, first-match-wins. Detail: [02-CLUSTER-RULES.md](02-CLUSTER-RULES.md) |
| FR-13 | Explainable cluster: setiap assignment menyimpan `reason` JSONB dan ditampilkan sebagai "Why this cluster?" |
| FR-22 | `as_of_date` = MAX(order_date) dataset aktif, bukan `NOW()` |
| FR-23 | Yacona dipisah: tidak masuk RFM/Cohort Probetes, `yacona_frequency` dihitung terpisah |

### Aplikasi

| ID | Requirement |
|---|---|
| FR-14 | Customer detail dibuka sebagai Sheet dari kanan: profile, RFM, cluster + alasan, group, produk, timeline transaksi, cluster history |
| FR-15 | Search: nama customer, nomor HP, CS (opsional order ID) |
| FR-16 | Import History: setiap upload tercatat dengan status |
| FR-17 | Tombol Recalculate: hitung ulang tanpa upload ulang (mis. setelah rule/mapping berubah) |
| FR-24 | **Export CSV daftar broadcast per cluster** — nomor HP sudah ternormalisasi, dapat difilter cluster + CS + produk + rentang tanggal |
| FR-25 | Product Mapping: raw product → canonical, dengan saran; approval manual wajib |
| FR-26 | Group Membership: dapat diupdate manual, sumber `IMPORT` atau `MANUAL` |
| FR-27 | Auth.js dengan role ADMIN/CRM/MANAGEMENT |

---

## 6. Prinsip yang tidak boleh dilanggar

```
NO PHONE          → EXCLUDE (bukan cluster F)
YACONA            → SEPARATE
RFM / COHORT      → SQL di Neon
FREQUENCY         → COUNT DISTINCT ORDER
CLUSTER           → BUSINESS RULE, bukan ML
UNKNOWN PRODUCT   → NEEDS_REVIEW (bukan cluster F)
A1–F              → ONE CUSTOMER ONE CLUSTER
AS OF DATE        → MAX(order_date) dataset
DATABASE ALL      → FULL SNAPSHOT
RAW DATA          → IMMUTABLE
```

---

## 7. Prioritas rilis

| Tahap | Isi | Nilai bisnis |
|---|---|---|
| **1** | Import + dedup + RFM + cluster engine + **export broadcast** | Tim CRM bisa langsung broadcast |
| **2** | Dashboard KPI, Cluster page, Customer sheet | Management bisa lihat angka |
| **3** | Cohort heatmap, Repeat Purchase Funnel, RFM page | Analisis retention |
| **4** | Auth, Product Mapping UI, Data Quality, Import History | Siap dipakai banyak orang |

---

## 8. Validasi bisnis sebelum UI dianggap benar

Jalankan Database All yang sama di sistem lama dan sistem baru, bandingkan:
total customer · F1–F4+ · A1 · A2 · A3 · A4 · B · C · D · Dhp · E · F · revenue · cohort size.

Jika berbeda: **jangan langsung menyalahkan salah satu.** Buat reconciliation report:
```
A1 Legacy : 209
A1 New    : 201
Selisih   : 8   → [ Tampilkan 8 customer yang berbeda ]
```

Angka acuan ada di [06-DATA-FINDINGS.md §11](06-DATA-FINDINGS.md).

---

## 9. Batasan yang diketahui

| Batasan | Dampak | Mitigasi |
|---|---|---|
| Kolom `Status` kosong 99,97% | Retur COD tidak terdeteksi; Monetary = nilai order dibuat | Label eksplisit di dashboard: "belum dikurangi retur" |
| `idgrup` bukan grup konsultasi | Cluster C/D/Dhp belum akurat | Tabel group independen, siap diisi data Nayla |
| `Total Bayar` kosong 80% | Monetary pakai `Nilai Produk`, ongkir tidak termasuk | Perlu konfirmasi bisnis |
| Data hanya sejak Jan 2025 | Cohort sebelum 2025 tidak ada | — |
