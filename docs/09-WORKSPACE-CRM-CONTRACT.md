# Workspace CRM — Metric, Identity, dan Status Contract

Status: **baseline implementasi terkunci**. Dokumen ini melengkapi `02-CLUSTER-RULES.md`; aturan cluster tidak berubah.

## 1. Audit awal

### Dapat digunakan ulang

- `orders`/`order_items`: transaksi kanonik Database All. Grain analitik cluster tetap satu customer + satu tanggal.
- `crm_reports`/`crm_report_items`: pesanan manual relational; diperlakukan sebagai `CRM_MANUAL` provisional.
- `import_batches`/`staging_import_rows`: staging, file-hash idempotency, dan sumber audit import.
- `products`/`product_aliases`: Product Master dan mapping produk yang di-approve.
- `crm_tasks`/`crm_task_history`: Pembagian Tugas existing, onboarding partial unique, assignment/outcome history.
- `customer_group_memberships` + history: membership current dan append-only history.
- Auth.js + `requireRole`: guard backend existing; permission policy minimum ditambahkan tanpa User Management baru.

### Gap sebelum implementasi

- Order official belum memiliki classification CRM versioned, status finansial, HPP snapshot, dan alokasi item.
- Pesanan manual belum memiliki lifecycle provisional/reconciliation dan audit detail.
- Lead batch official belum tersedia.
- Product Master belum memiliki histori HPP bertanggal efektif.
- Task history belum merekam outcome/assignment sebagai audit generik; task belum dapat menaut ke official order.
- Overview existing masih overview task, bukan laporan finansial official.
- Performa Tim belum tersedia.

### Risiko migrasi

- `orders` dipakai cluster/RFM; kolom lama tidak diubah atau dihapus.
- Nilai lama dipertahankan. Kolom Workspace ditambahkan nullable/default aman lalu dibackfill hanya dari data yang memang tersedia.
- Status sumber tidak lengkap (`Status` hampir seluruhnya kosong). Backfill memakai `CONFIRMED`, tetapi Data Quality tetap menunjukkan keterbatasan sumber.
- HPP historis tidak dapat ditebak dari nilai `HPP` lama yang belum tervalidasi. Item tetap `UNKNOWN` sampai Product HPP diisi.

## 2. Grain dan source

| Entitas | Grain | Source resmi |
|---|---|---|
| `crm_lead_batches` | satu batch leads stabil | sumber resmi yang disetujui |
| `orders` | satu customer + satu business date untuk kompatibilitas cluster | `DATABASE_ALL` |
| `order_items` | satu produk/baris kanonik dalam order | `DATABASE_ALL` |
| `crm_reports` | satu pesanan manual | `CRM_MANUAL` |
| `crm_report_items` | satu produk manual | `CRM_MANUAL` |
| `crm_order_adjustments` | satu delta immutable | correction/re-import |
| `crm_reconciliations` | hubungan manual ↔ official | sistem/reviewer |
| `crm_tasks` | satu pekerjaan customer | import/manual |

`orders` tidak dimodel ulang: definisi Frequency immutable tetap satu customer + satu tanggal. `idpesan` tetap pada item sebagai provenance.

## 3. Metric contract

| Metric | Source | Grain | Business date | N/A |
|---|---|---|---|---|
| Total Leads | official lead batch unik | lead batch | periode batch/received_at | identity/periode/dimensi tidak kompatibel |
| Total Closing | order official net eligible | distinct order | `order_date` | tidak |
| Pendapatan | official base + revenue adjustment | order | `order_date`/adjustment effective date | tidak |
| COS | item HPP snapshot + COS adjustment | item/order | `order_date` | HPP tidak lengkap untuk margin resmi |
| COM | biaya marketing official + COM adjustment | order | `order_date` | tidak |
| AOV | Pendapatan / Closing | report slice | sama | Closing = 0 |
| Margin resmi | Pendapatan − COS − COM | report slice | sama | satu item HPP `UNKNOWN` |
| Conversion Overview | Closing / Leads Received | compatible slice | sama | grain/dimensi leads tidak kompatibel |
| Financial Closing | official order mapped CS | order | `order_date` | CS tidak teratribusi dipisahkan |
| Task Conversion | task dengan linked official order / assigned eligible | task | assigned_at + link | denominator = 0 |
| Historical Overdue | due date vs completed/report cutoff | task | cutoff eksplisit | tidak |

Filter produk menggunakan item: closing distinct order, quantity item, pendapatan/COS/COM/margin hasil alokasi item. Tidak pernah memakai seluruh `order_total` ketika satu produk dipilih.

## 4. Identity dan idempotency

- Import batch: `UNIQUE(source_type, file_hash)` existing.
- Official order: `source_order_key = order_date|normalized_phone` existing dan immutable untuk cluster. Fingerprint Workspace versioned disimpan untuk audit/reconciliation.
- Official item: `source_item_key` existing.
- Lead batch: partial unique `(source, source_batch_id)` atau `(source, report_reference)`; minimal satu identity wajib ada.
- Manual order: primary key `crm_reports.id`; source tidak pernah berubah.
- Reconciliation: satu manual maksimal satu active/approved relation; satu official maksimal satu approved relation.
- Adjustment: `(source, source_adjustment_id)` atau deterministic fingerprint; minimal satu wajib ada.
- Onboarding: partial unique `customer_id WHERE task_type='FOLLOW_UP_NEW_CUSTOMER'` existing.

Fingerprint memakai canonical serialization versioned: source, business date, normalized phone, normalized customer, sorted product multiset + qty, total, normalized CS. Tidak memakai random UUID atau import batch ID.

## 5. Status effect matrix

Nilai net = base official + seluruh adjustment immutable.

| Status | Closing | Revenue | Quantity | COS | COM |
|---|---:|---:|---:|---:|---:|
| `CONFIRMED` | base | base | base | base | aktual |
| `CANCELLED` | 0 | 0 | 0 | adjustment aktual | aktual/adjustment |
| `COD_FAILED` | 0 | 0 | 0 | adjustment non-recoverable | aktual/adjustment |
| `RETURNED` | net adjustment | net adjustment | net adjustment | recoverable adjustment | aktual/adjustment |
| `REFUNDED` | 0 untuk full refund | net adjustment | adjustment bila return | recoverable adjustment | aktual/adjustment |
| `PARTIALLY_REFUNDED` | base | net adjustment | item return adjustment | recoverable adjustment | aktual/adjustment |
| `ADJUSTED` | base + delta | base + delta | base + delta | base + delta | base + delta |

Sumber Database All yang tidak menyediakan status valid diperlakukan `CONFIRMED` untuk kompatibilitas existing, disertai indikator kualitas sumber. Tidak ada status transaksi yang ditebak selain default legacy tersebut.

## 6. HPP dan allocation

- HPP interval `[effective_from, effective_to)`; overlap produk ditolak DB.
- Snapshot dipilih memakai `order_date` saat persistence/import.
- Missing HPP: `hpp_status=UNKNOWN`, bukan nol. Pendapatan tetap tampil; margin resmi `N/A`.
- Allocation integer menggunakan largest remainder: floor rasional, sisa diberikan menurut remainder terbesar, tie-break `allocation_sequence` stabil dari source item key.
- Komponen allocatable V1: diskon, packing, admin COD, voucher CRM, COM. Ongkir tetap order-level sampai keputusan bisnis eksplisit.

## 7. Official dan provisional

- Official: `orders`/`order_items`, source `DATABASE_ALL`, read-only dari Workspace.
- Provisional: `crm_reports`/`crm_report_items`, source `CRM_MANUAL`.
- Reconciliation hanya membuat hubungan. Manual tidak dihapus atau diubah source-nya.
- Setelah `RECONCILED`, manual dikeluarkan dari KPI provisional; official dihitung satu kali.

## 8. Authorization minimum

Policy role sementara:

- `ADMIN`: seluruh permission Workspace.
- `CRM`: read metrics/orders/export; create/update/cancel manual order; assign/update task; update membership.
- `MANAGEMENT`: read metric dan official order; export.
- Adjustment, HPP mutation, dan reconciliation approval/reject: `ADMIN` saja.

Semua guard dilakukan backend. Mapping ini dapat diganti saat User Management permission-granular dibuat.

## 9. Timezone

Business timezone `Asia/Jakarta`. Filter URL memakai business date `YYYY-MM-DD`, query date memakai half-open interval bila kolom timestamp. Kolom `date` dibanding langsung secara inclusive. Historical analytics memakai cutoff eksplisit; current overdue saja boleh memakai waktu sekarang.
