# Browser E2E (Playwright)

Menjalankan browser sungguhan terhadap dev server (`npm run dev`) yang terhubung ke Neon
DB yang sama dengan `DATABASE_URL` di `.env`. Bukan database terpisah — setiap test yang
menulis data (order, biaya operasional) **wajib membatalkan (cancel) data yang dibuatnya
di akhir test**. Order/biaya CANCELLED tetap tersimpan untuk audit tapi tidak pernah
masuk KPI, jadi aman ditinggalkan.

## Menjalankan

```bash
npx playwright test
```

## Kredensial fixture (wajib sebelum run pertama)

Test login sebagai beberapa role: `crm` (Sarah Rahma Niyar), `leader` (Feny Nuraini —
harus PERSIS nama ini, lihat `src/lib/workspace-cost-workflow.ts`), `spv` (Ni'mah
Luthfianingsih), `direktur` (Rahman Arief Dewantara), dan `admin` (fixture khusus test,
bukan akun asli).

Kredensial dibaca dari `e2e.credentials.local.json` di root project — file ini
**gitignored**, tidak pernah dibuat otomatis oleh CI, dan tidak pernah berisi password
akun produksi/asli. Untuk generate:

1. Pastikan 6 user tim CRM sudah pernah di-seed (`npm run workspace:seed-crm-team`).
2. Buat script sekali-pakai yang memanggil `upsertUser`/`changeOwnPassword` dari
   `src/server/auth/users.ts` untuk membuat password test yang stabil dan diketahui untuk
   ke-6 akun tersebut + satu akun ADMIN fixture (`e2e-admin@probetes.local`), lalu tulis
   hasilnya ke `e2e.credentials.local.json` sebagai `{ "email": "password", ... }`.
3. Jangan gunakan password akun produksi asli untuk automation — akun asli harus tetap
   memakai `mustChangePassword` dan alur ganti password normal.

`e2e/global-setup.ts` login sekali per role dan menyimpan `storageState` ke
`e2e/.auth/*.json` (juga gitignored) — dipakai ulang oleh semua spec lewat
`test.use({ storageState })` atau `browser.newContext({ storageState })`.

## Cakupan skenario (docs prompt perbaikan §8)

| # | Skenario | File |
|---|---|---|
| 1-2 | Overview/Pesanan dapat dibuka | navigation.spec.ts |
| 3-9 | Product combobox, PRD-0025 SALE/BONUS, Admin COD, TOTAL real-time | pesanan-form.spec.ts |
| 10-12 | Create+confirm order, CANCELLED tidak masuk KPI, filter tanggal konsisten Overview/Pesanan | pesanan-lifecycle.spec.ts |
| 13-16 | Leader/SPV membuat biaya, CRM biasa ditolak, Direktur approval akhir, COM masuk Overview | biaya-operasional.spec.ts |
| 17-18 | Performa Tim tidak ada di menu, route 404 | navigation.spec.ts |
