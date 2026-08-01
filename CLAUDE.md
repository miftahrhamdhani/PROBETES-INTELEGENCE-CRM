# PROBETES Customer Intelligence — Instruksi Proyek

Aplikasi internal untuk mengolah **Database All** (Excel/CSV transaksi) menjadi
RFM, Cohort, Retention, Frequency, dan **Customer Cluster Probetes (A1–F)**.
Menggantikan alur lama: Spreadsheet → Apps Script → BigQuery → Dashboard manual.

---

## ATURAN MUTLAK — jangan dilanggar

1. **Aturan cluster A1–F adalah aturan perusahaan. DILARANG mengubah, "memperbaiki",
   menyederhanakan, atau menambah cluster.** Sumber tunggal: [docs/02-CLUSTER-RULES.md](docs/02-CLUSTER-RULES.md).
   Kalau menemukan kejanggalan → tulis di [docs/07-OPEN-QUESTIONS.md](docs/07-OPEN-QUESTIONS.md), jangan diubah sendiri.
2. **Cluster ditentukan business rule, BUKAN machine learning.** Tidak ada K-Means,
   scikit-learn, atau klasifikasi AI di V1.
3. **Satu customer = tepat satu cluster.** Evaluasi `FIRST MATCH WINS` sesuai urutan prioritas.
4. **`EXCLUDED_NO_PHONE`, `YACONA_NON_COHORT`, `NEEDS_REVIEW` bukan cluster.** Jangan
   pernah membuang customer bermasalah ke cluster F.
5. **Raw data tidak pernah diedit.** Alur: `RAW → STAGING → NORMALIZED → CANONICAL`.
6. **`as_of_date` = MAX(order_date) dari dataset aktif.** JANGAN pakai `NOW()`/`new Date()`
   di perhitungan analitik mana pun.
7. **Uang disimpan `BIGINT` rupiah.** Tidak pernah `float`/`double`.
8. **Import wajib idempoten.** Upload file yang sama 2× → state database identik.
9. **Unknown product tidak boleh menggagalkan import.** Customer yang cluster-nya
   bergantung produk unknown → `NEEDS_REVIEW`.
10. **Tidak ada mapping produk otomatis diam-diam.** Alias baru harus di-approve admin.

---

## Stack V1

| Layer | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| Table | TanStack Table |
| Chart | Recharts (heatmap = custom CSS Grid) |
| DB | Neon PostgreSQL |
| ORM | Drizzle ORM |
| Auth | Auth.js |
| Excel/CSV | SheetJS / PapaParse |
| Host | Vercel |

**Jangan tambahkan tanpa diminta:** Python, FastAPI, Docker, Redis, Kafka,
message queue, microservice, visual rule-builder generik.

### Pembagian tanggung jawab
- **SQL (Neon)** → agregasi berat: RFM, Cohort, Retention, Frequency
- **TypeScript** → orchestration import + cluster rule engine (agar bisa di-unit-test)

---

## Dokumen

| File | Isi |
|---|---|
| [docs/01-PRD.md](docs/01-PRD.md) | Tujuan, user, functional requirements |
| [docs/02-CLUSTER-RULES.md](docs/02-CLUSTER-RULES.md) | **Aturan cluster — IMMUTABLE** |
| [docs/03-ERD.md](docs/03-ERD.md) | Skema database |
| [docs/04-DESIGN.md](docs/04-DESIGN.md) | Arsitektur, pipeline import, algoritma |
| [docs/05-UI.md](docs/05-UI.md) | Struktur halaman, wireframe, komponen |
| [docs/06-DATA-FINDINGS.md](docs/06-DATA-FINDINGS.md) | Hasil analisis file asli + angka validasi |
| [docs/07-OPEN-QUESTIONS.md](docs/07-OPEN-QUESTIONS.md) | Pertanyaan terbuka ke stakeholder |

Sebelum menyentuh logika cluster, **baca 02 dan 06 dulu.**

---

## Perintah

```bash
npm run dev              # dev server
npm run test             # unit test cluster engine (WAJIB hijau sebelum commit)
npm run typecheck        # tsc --noEmit
npm run db:generate      # generate migration dari schema
npm run db:migrate       # jalankan migration ke Neon
npm run db:seed:admin -- <email> "<nama>" "<password>" [ADMIN|CRM|MANAGEMENT]  # buat/reset user (tanpa registrasi publik)
npm run validate:legacy  # jalankan engine atas file Excel asli, cetak jumlah per cluster
```

---

## Konvensi kode — BACKEND vs FRONTEND wajib dipisah tegas

Satu project Next.js, satu deployment Vercel — **bukan** dua service terpisah.
Tapi folder dipisah tegas agar tetap clean code:

```
src/server/     BACKEND — fungsi murni & akses I/O. TIDAK ADA React/JSX/'use client'.
  ├─ db/          schema Drizzle + query
  ├─ normalize/   phone, product, amount, date, text
  ├─ cluster/     rule engine (types, features, engine, rules)
  ├─ import/      parser, validator, orchestrator
  └─ analytics/   RFM, cohort, frequency (SQL builder)

src/app/        FRONTEND (routes) + API route handler tipis
  ├─ (dashboard)/...page.tsx     UI, boleh Server Component, TIDAK berisi business logic
  └─ api/.../route.ts            HANYA memanggil src/server/*, tidak ada logika di sini

src/components/ FRONTEND — komponen UI murni (shadcn, chart, table, sheet)
src/lib/        SHARED — tipe & konstanta yang dipakai backend & frontend (mis. cluster codes),
                tanpa I/O, tanpa React
```

**Aturan keras:**
1. `src/server/**` **tidak boleh** meng-import apa pun dari `react`, `next/navigation`,
   atau file di `src/components/`. Backend harus bisa dites tanpa render apa pun.
2. `src/components/**` dan `src/app/**/page.tsx` **tidak boleh** mengimpor
   `src/server/db` langsung atau menjalankan query SQL. Semua akses data lewat
   Server Action / route handler yang memanggil `src/server/*`.
3. `route.ts` di `src/app/api/**` maksimal berisi: parsing request → panggil fungsi
   `src/server/*` → format response. Tidak ada business logic ditulis di route handler.
4. **Logika cluster harus fungsi murni** — input `CustomerFeatures`, output
   `ClusterAssignment`. Tanpa akses DB, tanpa `Date.now()`, tanpa React. Syarat agar
   bisa di-unit-test di `tests/` tanpa menyalakan server.
5. Setiap assignment cluster wajib menyimpan `reason` (JSONB) berisi angka yang
   dipakai memutuskan — dipakai fitur "Why this cluster?".
6. Nama cluster pakai konstanta dari `src/lib/cluster-codes.ts`, jangan string literal.
7. Komentar seperlunya; bahasa Indonesia untuk istilah bisnis, Inggris untuk teknis.

---

## Definition of Done sebuah fitur analitik

1. Unit test skenario di [docs/02-CLUSTER-RULES.md §Test Wajib](docs/02-CLUSTER-RULES.md) hijau
2. `npm run validate:legacy` menghasilkan angka dalam rentang wajar
   (lihat [docs/06-DATA-FINDINGS.md](docs/06-DATA-FINDINGS.md))
3. Selisih dengan sistem lama bisa dijelaskan per-customer, bukan ditebak
