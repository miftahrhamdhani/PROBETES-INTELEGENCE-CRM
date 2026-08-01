# ERD — Skema Database V1 (Neon PostgreSQL)

Prinsip: `RAW → STAGING → CANONICAL → ANALYTICS`.
Data mentah tidak pernah diedit; hasil normalisasi selalu tabel baru.

---

## 1. Peta relasi

```
┌──────────────────┐
│  import_batches  │──1:N──┐
└────────┬─────────┘       │
         │ 1:N             ▼
         ▼          ┌────────────────────┐
┌────────────────────┐ │ data_quality_issues│
│ staging_import_rows│ └────────────────────┘
└────────────────────┘

┌───────────┐          ┌───────────┐
│ cs_agents │──1:N──┐  │   users   │──1:N──┐
└───────────┘       │  └───────────┘       │
                    ▼                      ▼
              ┌──────────┐          ┌──────────────┐
              │  orders  │          │import_batches│
              └────┬─────┘          └──────────────┘
                   │
┌───────────┐      │ 1:N
│ customers │──1:N─┘      ┌──────────┐
└─────┬─────┘             │ products │──1:N──┐
      │                   └────┬─────┘       ▼
      │                        │      ┌─────────────────┐
      │                   1:N  │      │ product_aliases │
      │                        ▼      └─────────────────┘
      │              ┌──────────────┐
      │              │ order_items  │
      │              └──────────────┘
      │
      ├──1:N──► customer_group_memberships
      ├──1:1──► customer_rfm_current
      ├──1:1──► customer_cluster_current
      └──1:N──► customer_cluster_history

┌──────────────────┐
│ ksb_transactions │──N:1──► customers (nullable — banyak tanpa match)
└──────────────────┘         sumber: import_batches (source_type = KSB)

customer_group_memberships  ◄──── sumber: import_batches (source_type = GROUP_LIST)
```

> **Tiga jalur import berbeda, satu tabel `import_batches`:** dibedakan lewat
> `source_type` — `DATABASE_ALL` (transaksi Probetes), `KSB` (transaksi Yacona &
> keluarganya), `GROUP_LIST` (daftar nomor masuk Grup). Lihat
> [08-RECONCILIATION.md §1](08-RECONCILIATION.md) dan
> [07-OPEN-QUESTIONS.md Q12](07-OPEN-QUESTIONS.md).

---

## 2. Tabel

### 2.1 Import & staging

#### `import_batches`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | serial PK | |
| `source_type` | enum | `DATABASE_ALL` `KSB` `GROUP_LIST` — tiga jalur upload berbeda |
| `filename` | text | |
| `file_hash` | text | SHA-256 isi file — dasar deteksi upload ulang |
| `status` | enum | `UPLOADING` `STAGED` `PROCESSING` `COMPLETED` `FAILED` `CANCELLED` |
| `is_active` | boolean | **tepat satu baris `true` per `source_type`** — dataset yang dipakai dashboard |
| `uploaded_by` | int FK users | |
| `uploaded_at` | timestamptz | |
| `as_of_date` | date | MAX(order_date) valid dalam batch — hanya relevan untuk `DATABASE_ALL` |
| `total_rows` `valid_rows` `excluded_rows` `needs_review_rows` | int | |
| `error_message` | text | |

#### `staging_import_rows`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigserial PK | |
| `import_batch_id` | int FK | |
| `row_number` | int | nomor baris di file asli, untuk drill-down |
| `raw_data` | jsonb | isi baris apa adanya — **tidak pernah diubah** |
| `validation_status` | enum | `VALID` `EXCLUDED` `NEEDS_REVIEW` |
| `error_codes` | text[] | `MISSING_PHONE` `INVALID_PHONE` `UNKNOWN_PRODUCT` … |

> **Retensi:** simpan penuh untuk 3 batch terakhir. Batch lama sisakan hanya baris
> ber-`validation_status != 'VALID'`. Tanpa ini tabel tumbuh 35k baris JSONB tiap upload.

#### `data_quality_issues`
| Kolom | Tipe |
|---|---|
| `id` | bigserial PK |
| `import_batch_id` | int FK |
| `staging_row_id` | bigint FK |
| `issue_type` | enum `MISSING_PHONE` `INVALID_PHONE` `MISSING_ORDER_ID` `DUPLICATE_ORDER` `UNKNOWN_PRODUCT` `AMOUNT_CONFLICT` `INVALID_DATE` `NEEDS_REVIEW` |
| `detail` | jsonb |

---

### 2.2 Canonical

#### `customers`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | serial PK | |
| `normalized_phone` | text **UNIQUE** | identitas bisnis, `628xxxxxxxxx` |
| `display_phone` | text | bentuk asli terakhir dilihat |
| `name` | text | nama terakhir dilihat |
| `first_seen_batch_id` | int FK | |
| `created_at` `updated_at` | timestamptz | |

#### `orders`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigserial PK | |
| `source_order_key` | text **UNIQUE** | `{order_date}|{normalized_phone}` — **satu hari = satu order**, lihat catatan di bawah |
| `customer_id` | int FK | |
| `order_date` | **date** | bukan timestamptz — hindari geser timezone |
| `order_total` | **bigint** | rupiah, SUM seluruh `order_items` di hari itu |
| `platform` `division` `payment_method` `partner` | text | ternormalisasi |
| `cs_id` | int FK cs_agents | |
| `memo` | text | `NC` / `RO` dari file |
| `source_batch_id` | int FK | |

> ⚠️ **`source_order_key` sengaja TIDAK memasukkan `idpesan`.** Sistem lama
> mendefinisikan Frequency sebagai *"jumlah hari unik customer bertransaksi"*
> (dikonfirmasi dari kode sumber legacy), bukan jumlah `idpesan` unik. Detail:
> [02-CLUSTER-RULES.md §3.2](02-CLUSTER-RULES.md). `idpesan` asli tetap disimpan
> penuh per baris di `order_items.external_id` untuk ketertelusuran, tapi tidak
> dipakai untuk uniqueness/idempotensi order.

#### `order_items`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigserial PK | |
| `order_id` | bigint FK | |
| `product_id` | int FK products | |
| `raw_product_name` | text | apa adanya dari file |
| `external_id` | text | `idpesan` asli — disimpan untuk audit, **bukan** kunci uniqueness |
| `qty` | numeric | |
| `amount` | **bigint** | rupiah, `Nilai Produk` per item |
| `is_bonus` | boolean | nama mengandung "BONUS" **dan** amount = 0 |
| `identity_confidence` | enum `HIGH` `LOW` | `LOW` bila baris tanpa `idpesan` |

#### `ksb_transactions` — dataset KSB, sumber terpisah (Yacona & keluarganya)

> Konfirmasi dari data legacy: KSB (Yacona, Teacona, Bio Insuleaf, Zymuno, Nutriflakes,
> Probiogel) adalah **lini bisnis terpisah** dengan riwayat transaksi sendiri, TIDAK
> sama dengan baris Yacona yang kadang nyasar di Database All. Hanya dipakai untuk
> Cluster B — tidak masuk RFM/Cohort/Frequency Probetes.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigserial PK | |
| `customer_phone` | text | normalized — **tidak** di-FK ke `customers`; banyak yang tidak
punya baris `customers` sama sekali (murni pelanggan KSB) |
| `customer_id` | int FK customers, **nullable** | terisi kalau nomor ini juga ada di Database All |
| `transaction_date` | date | |
| `product_name` | text | Yacona 60, Bio Insuleaf, Etawalin, dll |
| `amount` | bigint | |
| `source_batch_id` | int FK import_batches | batch upload KSB (jalur terpisah dari Database All) |

`yacona_frequency` = `COUNT(DISTINCT transaction_date)` per `customer_phone` di tabel ini.

#### `products`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | serial PK | |
| `code` | text **UNIQUE** | `HERBAL_PROBETES`, `EBOOK`, `YACONA`, `UNKNOWN`, … |
| `name` | text | nama tampilan |
| `category` | enum `PHYSICAL` `DIGITAL` `BOOK` `SERVICE` `OTHER` `UNKNOWN` |
| `is_probetes` | boolean | |
| `is_yacona` | boolean | |
| `is_ebook` | boolean | dipakai `is_ebook` |
| `is_book_entry` | boolean | Ebook atau Buku Menuju Remisi |
| `is_hp_or_amandia` | boolean | Herbal Probetes / Sereal Amandia / Amandia Muesli |
| `is_target_physical` | boolean | daftar produk konversi Cluster E |
| `active` | boolean | |

> Flag ini yang dipakai cluster engine — **jangan hardcode nama produk di kode.**

#### `product_aliases`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | serial PK | |
| `raw_name` | text | contoh: `Tk Probetes Herbal 24` |
| `normalized_name` | text **UNIQUE** | uppercase, nbsp→spasi, spasi dirapatkan |
| `product_id` | int FK | |
| `approved_at` | timestamptz | **NULL = belum disetujui** |
| `approved_by` | int FK users | |
| `suggested_product_id` | int FK | saran sistem, tidak otomatis dipakai |

#### `cs_agents`
`id` · `name` · `normalized_name` UNIQUE · `is_person` (false untuk `Iklan`, `Live`, `Affiliate …`) · `active`

---

### 2.3 Group

#### `customer_group_memberships`
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | serial PK | |
| `customer_id` | int FK | |
| `group_code` | text | |
| `group_name` | text | |
| `joined_at` | date | |
| `status` | enum `ACTIVE` `LEFT` | |
| `source` | enum `IMPORT` `MANUAL` | dari upload `GROUP_LIST` (`masukWA`/`BackupMasukGrup`) atau input manual |
| `source_list` | text nullable | `masukWA` / `BackupMasukGrup` — untuk audit asal data, lihat [07-OPEN-QUESTIONS.md Q1](07-OPEN-QUESTIONS.md) |
| `updated_at` | timestamptz | |

UNIQUE `(customer_id, group_code)`.
`has_group` = ada minimal satu baris `status = 'ACTIVE'`.

---

### 2.4 Analytics

#### `customer_rfm_current` — 1 baris per customer, ditimpa tiap rebuild
`customer_id` UNIQUE FK · `as_of_date` · `recency_days` · `frequency` · `monetary` bigint ·
`first_order_date` · `last_order_date` · `avg_order_value` bigint · `customer_age_days` ·
`yacona_frequency` · `cohort_month` · `updated_at`

#### `customer_cluster_current` — 1 baris per customer
`customer_id` UNIQUE FK · `cluster_code` · `rule_version` · `reason` jsonb · `assigned_at`

`cluster_code` termasuk status non-cluster: `EXCLUDED_NO_PHONE`, `YACONA_NON_COHORT`, `NEEDS_REVIEW`.

#### `customer_cluster_history` — hanya ditulis saat cluster BERUBAH (SCD Type 2)
`id` · `customer_id` FK · `cluster_code` · `valid_from` · `valid_to` (NULL = aktif) ·
`rule_version` · `reason` jsonb · `batch_id`

> Jangan tulis baris tiap recalculate — hanya saat nilai berubah. Tanpa ini tabel
> tumbuh 20k baris tiap upload.

#### `cluster_rules` — dokumentasi & versioning, bukan mesin eksekusi
`id` · `cluster_code` · `version` · `priority` · `rule_definition` jsonb · `description` ·
`effective_from` · `effective_to` · `active`

> Eksekusi tetap di TypeScript agar bisa di-unit-test. Tabel ini merekam aturan
> yang berlaku pada satu `rule_version` untuk keperluan audit.

---

### 2.5 Auth

#### `users`
`id` · `email` UNIQUE · `name` · `password_hash` · `role` enum `ADMIN` `CRM` `MANAGEMENT` · `active` · `created_at`

---

## 3. Aturan teknis

| Aturan | Alasan |
|---|---|
| Uang selalu `bigint` rupiah | `float` menimbulkan galat pembulatan |
| `order_date` bertipe `date` | menghindari geser bulan cohort akibat timezone |
| Koneksi Neon **pooled** (`-pooler`) atau `@neondatabase/serverless` | serverless + Postgres mudah kehabisan koneksi |
| Advisory lock saat import/recalculate | mencegah dua proses menulis bersamaan |
| `is_active` di `import_batches` | commit atomic, dashboard tidak pernah separuh data |

### Index wajib
```sql
customers          (normalized_phone)                 UNIQUE
orders             (source_order_key)                 UNIQUE   -- (order_date, normalized_phone)
orders             (customer_id, order_date)
order_items        (order_id)
order_items        (product_id)
ksb_transactions    (customer_phone, transaction_date)
ksb_transactions    (customer_id)
product_aliases    (normalized_name)                  UNIQUE
customer_rfm_current     (customer_id)                UNIQUE
customer_cluster_current (cluster_code)
customer_cluster_history (customer_id, valid_from)
staging_import_rows      (import_batch_id, validation_status)
```
