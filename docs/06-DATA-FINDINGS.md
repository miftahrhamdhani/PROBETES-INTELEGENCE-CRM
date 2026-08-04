# Hasil Analisis File Asli — `01. database All.xlsx`

Analisis dijalankan 30 Juli 2026 atas file produksi
`C:\Users\Miftah Ramdhani\OneDrive\Dokumen\01. database All.xlsx` (18,8 MB).

Dokumen ini **wajib dibaca sebelum menulis parser atau engine.**
Banyak asumsi di blueprint awal ternyata tidak sesuai data nyata.

---

## 1. Struktur file

| Sheet | Baris | Keputusan |
|---|---:|---|
| **`allbaru`** | **35.189** | ✅ **satu-satunya sheet yang diimpor** |
| `filter disini` | 35.189 | ❌ copy kerja, ada `#REF!` |
| `UPDM` | 34.029 | ❌ 100% subset `allbaru` |
| `Ebook UPDM` | 13.519 | ❌ 100% subset `allbaru` |
| `Tumbuhpedia` | 5 | ❌ 100% subset `allbaru` |
| `Teman diet` | 3 | ❌ 100% subset `allbaru` |
| `Setiya`, `Jawara`, `SNS` | 0 | ❌ kosong |

Diverifikasi dengan perbandingan signature ternormalisasi
`(tanggal, customer, hp, produk, nilai)`: **nol baris unik** di luar `allbaru`.

### Kolom `allbaru` (39 kolom)
```
Tanggal Pesanan · Customer · No. HP · Alamat · Ekspedisi · No. Resi · No. Invoice
Memo · pembayaran · Produk 1 · Qty 1 · Nilai Produk · Ongkir · Packing
DiskonOngkir · Fee Cod · Total Bayar · Mitra · CS · ADV · DIVISI · Note · Status
Tgl Status Penerimaan · Alasan Retur · HPP · Tanggal rekonsiliasi
Nilai Rekonsiliasi · Verifikasi · Kode Prod 1 · Kode Prod 2 · Kode Prod 3
PRODUK TERJUAL · HUB · idpesan · idgrup · Kota/Kabupaten · BiayaMarketingCRM · Platform
```

- Baris pertama setelah header adalah **baris rumus/hitungan**, bukan data → harus dilewati
- Kolom ke-40..45 tanpa header, **100% kosong** → abaikan
- `Kode Prod 1/2/3` dan `PRODUK TERJUAL` **100% kosong** → tidak dipakai

---

## 2. 🔴 `idpesan` BUKAN order ID yang unik

Temuan paling kritis. Ada dua format bercampur:

| Format | Baris | Duplikat | Sifat |
|---|---:|---|---|
| Teks `CRMHP241777012294212` | 8.695 | 1.531 id, **1.530 = multi-item order sah** | ✅ ID asli |
| Angka `1379`, `577` | 26.494 | 540 id, **540 = TABRAKAN** | ❌ counter |

Bukti tabrakan:
```
idpesan = 1379
  2025-01-01 | 6281230359999 | NUTRIFLAKES | Rp 276.000
  2025-06-03 | 6281218258335 | Ebook 30    | Rp  89.000    ← customer & tanggal beda
```

### Keputusan — ⚠️ SUDAH DIGANTIKAN

> **Keputusan awal di bawah TIDAK LAGI BERLAKU.** Kode sumber sistem lama yang
> ditemukan kemudian mengonfirmasi Frequency dihitung dari **hari unik**, bukan
> `idpesan`. Order key final yang dipakai kode saat ini:
>
> ```
> canonical_order_key = (order_date, normalized_phone)      -- SATU HARI = SATU ORDER
> ```
>
> Lihat [02-CLUSTER-RULES.md §3.2](02-CLUSTER-RULES.md) (definisi resmi) dan
> [08-RECONCILIATION.md §3.1](08-RECONCILIATION.md) (bukti numerik: |Δ| 2.257 → 2.023).
> `idpesan` tetap disimpan penuh di `order_items` untuk ketertelusuran per-item,
> tapi **tidak dipakai** untuk Frequency/Cluster.

Keputusan awal (arsip):
```
canonical_order_key = (order_date, normalized_phone, idpesan)
```
Terbukti menghasilkan **30.483 order** dari baris valid, **nol duplikat 100%**.

Baris tanpa `idpesan` → `identity_confidence = LOW` dan `sourceItemKey` memakai
penanda `NO_ID` (di file ini: 0 baris, semua punya idpesan).

---

## 3. 🔴 `Total Bayar` kosong 80% — Monetary pakai `Nilai Produk`

```
Total Bayar   kosong 28.258 / 35.189   (80,3 %)   ❌ tidak bisa dipakai
Nilai Produk  kosong        53         ( 0,15%)   ✅ dipakai
```

Dari 6.931 baris yang keduanya terisi, **6.133 nilainya berbeda** — termasuk
kasus `Total Bayar = 0` sementara `Nilai Produk = 99.000`.

### `Nilai Produk` adalah nilai PER ITEM

Diuji atas 1.498 order multi-baris:

| Pola | Jumlah |
|---|---:|
| Hanya 1 baris berbayar, sisanya bonus Rp0 | 759 |
| Tiap baris nilainya berbeda (= per item) | 724 |
| Semua baris nilainya sama | 15 |

15 kasus "nilai sama" bukan pengulangan order-total, melainkan dua produk
berbeda yang kebetulan seharga sama:
```
MPEB901777271897203
  Ebook 90  × 1  Rp 73.500
  Ebook 101 × 1  Rp 73.500     → order_total yang benar = Rp 147.000
```

**Kesimpulan:** `order_total = SUM(Nilai Produk per item)`.
Skenario "order total diulang di tiap baris" (PRD §14) **tidak terjadi** di dataset ini.
`AMOUNT_CONFLICT` hanya di-flag bila baris benar-benar identik (produk+qty+nilai sama)
— di file ini **0 kasus**.

**Konsekuensi:** ongkir & fee COD tidak masuk Monetary. Perlu dikonfirmasi karena
mempengaruhi ambang A1 Rp 1,5 juta.

---

## 4. 🔴 `Status` praktis kosong — retur COD tidak terdeteksi

```
Status kosong  35.180 / 35.189   (99,97 %)
terisi         8× "sukses", 1× "Success"
```

`Alasan Retur` dan `Tgl Status Penerimaan` juga kosong, padahal ada **4.499 order COD**.

**Konsekuensi:** Monetary = nilai order dibuat, **bukan** uang yang benar-benar masuk.
Dashboard wajib memberi label eksplisit: *"Nilai order (belum dikurangi retur)"*.
Sesuai PRD §14, jangan mengarang rule COD/settlement di V1.

---

## 5. 🔴 `idgrup` BUKAN grup konsultasi

```
-1002269832980   25.345 baris
-1002324324138    1.149 baris
(kosong)          8.695 baris
```

Hanya **2 nilai**, padahal Grup Konsultasi bertambah minimal 1 tiap bulan.
Polanya: `idpesan` numerik → `idgrup` terisi; `idpesan` teks → `idgrup` kosong.
Artinya ini **ID grup notifikasi Telegram / penanda sumber sistem**, bukan keanggotaan customer.

**Dampak:** `has_group` menentukan 7 dari 14 cluster
(C-Prodig, C-HP, C-F2, D-New, D-Old, Dhp-New, Dhp-Old).

**Keputusan V1** (sesuai PRD §34): pakai `idgrup` non-empty sebagai sumber awal
`has_group`, tapi simpan di tabel `customer_group_memberships` yang independen
dengan `source = 'IMPORT'`, sehingga bisa ditimpa `source = 'MANUAL'` begitu
data asli dari Nayla tersedia.

⚠️ Selama data asli belum masuk, **angka cluster C/D/Dhp tidak dapat dipercaya.**
Tampilkan peringatan di halaman Cluster dan Dashboard.

---

## 6. Yacona = 26% dari seluruh data

```
Baris Yacona                      9.256  (26,3%)
Customer pernah beli Yacona       4.686
  └ HANYA Yacona                  4.404   → YACONA_NON_COHORT
  └ campur produk Probetes          282

Customer 19.734  →  15.374 setelah Yacona dikeluarkan  (−4.360)
```

Distribusi `yacona_frequency`:
```
F1 3.194 · F2 726 · F3 300 · F4 160 · F5 98 · F6 52 · F7 41 · F8 25 · F9 21 · F10 16
```

| Ambang | Customer |
|---|---:|
| `> 5` (≥6) — **sesuai aturan** | **208** |
| `>= 5` | 306 |

> Angka 1.006 di konsep awal tidak cocok dengan keduanya. Lihat [07-OPEN-QUESTIONS.md](07-OPEN-QUESTIONS.md).

---

## 7. Nomor HP

```
kosong        2.701  (7,7%)  → EXCLUDED_NO_PHONE
float         32.470          → risiko .0 di akhir
int/str          18
tanpa awalan 62   53
panjang aneh       6  (26 digit ×3, 9 digit ×2, 0 digit ×1)
```

Tidak ditemukan scientific notation — data belum rusak. **Tetap wajib** membaca
kolom ini sebagai teks di SheetJS (`raw: false` / `cell.w`) agar tidak rusak di kemudian hari.

Customer unik setelah normalisasi: **19.734**.

---

## 8. Produk — 132 varian mentah → 110 setelah normalisasi

Penyebab terbesar: **non-breaking space (`\xa0`)** memecah satu produk jadi dua.
```
'Ebook 90'     6.312 baris
'Ebook\xa090'  4.476 baris   → setelah normalisasi: EBOOK 90 = 10.788
```

Normalisasi wajib: ganti `\xa0` → spasi, rapatkan spasi ganda, trim, uppercase.

### Prefix varian yang harus dipetakan
`S ` · `Tk ` · `HP COD` · `PBH 70` · `Pro Herbal Dummy` · `... Bonus`

### Item bonus
```
921 baris mengandung "BONUS", 918 di antaranya bernilai Rp 0
917 dari 921 menempel pada order yang sama dengan item berbayar
```
→ Diabaikan saat menentukan kategori order (lihat [02-CLUSTER-RULES.md §4.2](02-CLUSTER-RULES.md)).

### 14 produk yang tidak ada di daftar resmi perusahaan
```
NUTRIFLAKES · BIO INSULEAF · ETAWALIN · ETAWAKU · GOMILK 200 · PROBIOGEL
ZYMUNO · TEACONA 20 · GM · GMB · NEU20 · EKA FARM · NUTRIFLAKES · BUKU KURUS
```
Plus layanan: `WEBINAR` · `KELAS MEAL PLAN` · `KONSUL MEAL PLAN` · `REKAMAN WEBINAR`
· `KONSUL PAK RAHMAN` · `PAKET APRESIASI REMISI` · `TOPPING` · `TAS PROBETES BONUS`

Semua → `UNKNOWN`, customer terdampak → `NEEDS_REVIEW`, menunggu approval admin.

### Minyak ada 3 varian terpisah
`MINYAK KELAPA` (94) · `MINYAK KELAPA CCO` (82) · `MINYAK VCO` (33) · `MINYAK KELAPA VCO` (8) · `VCO` (2) · `MINYAK` (4) · `MINYAK CCO` (1)
Aturan Cluster E menyebut ketiganya terpisah → dipertahankan sebagai 3 canonical product.

---

## 9. Kolom lain yang butuh normalisasi

| Kolom | Masalah |
|---|---|
| `CS` | 79 varian; duplikat casing (`WAHYU`/`Wahyu`, `FIAN`/`Fian`, `ASLA`/`Asla`, `BAGAS`/`Bagas`); ada nilai non-orang (`Iklan`, `Live`, `Affiliate Eksternal/Internal`, `Yacona Herbal Alami`, `Amandia sereal`, `Probetes`) |
| `Mitra` | `UP DM`/`UPDM`/`UP`/`Up dm`/`UP DM. .`/`UP DN` sama; `JAWARA`/`Jawara`/`JJAWARA`/`JAWAERA` sama |
| `Platform` | kosong 80% (28.104). Hanya `Meta`/`META`/`Shopee`/`Tiktok` |
| `DIVISI` | lebih terisi: `Akuisisi` 16.295 · `CRM` 11.266 · `Tiktok MP` 7.489 · varian casing |
| `pembayaran` | 38 varian, mayoritas `TRANSFER*`. Perlu dikelompokkan `TRANSFER` / `COD` |
| `Memo` | `NC` 13.806 · `RO` 10.875 · kosong 10.501 → berguna untuk validasi silang urutan order |

---

## 10. Rentang & sebaran data

```
Periode: 1 Jan 2025 – 26 Jul 2026  (19 bulan)
as_of_date = 2026-07-26
```

Tidak ada data sebelum Januari 2025.

### Cohort first-order (sebelum Yacona dikeluarkan)
```
2025-01 1197 · 2025-02  837 · 2025-03  671 · 2025-04 1022 · 2025-05 1147
2025-06 1164 · 2025-07  905 · 2025-08 1350 · 2025-09 1472 · 2025-10 1253
2025-11 1075 · 2025-12 1017 · 2026-01  995 · 2026-02  825 · 2026-03  451
2026-04  954 · 2026-05 1204 · 2026-06 1351 · 2026-07  844
```

### Frequency setelah Yacona dikeluarkan
```
F1  12.414
F2   1.787
F3     473
F4     237
F5+    463
```

### Produk pembelian pertama
```
EBOOK/DIGITAL   13.130
HERBAL/AMANDIA   1.927
FISIK LAIN         181
BUKU CETAK         136
```
Konsisten dengan "produk yang diiklankan: Ebook dan Herbal Probetes".

---

## 11. 🎯 Angka target validasi

Hitungan kasar (belum pakai mapping produk final & data grup asli)
dibanding angka pada konsep awal perusahaan:

| Metrik | Hitungan dari data | Konsep awal | Status |
|---|---:|---:|---|
| Cluster E | 5.662 | 4.980 | dekat ✅ |
| Pool C/D/Dhp (first order ≥ Nov 2025) | 8.299 | 6.602 | dekat ✅ |
| Customer F3 (calon A3) | 473 | 445 | sangat dekat ✅ |
| Cluster B (`yacona_freq > 5`) | 208 | 1.006 | **tidak cocok** ❌ |
| Total customer | 19.734 | 20.184 | dekat ✅ |

Kedekatan angka menunjukkan aturannya dapat direproduksi.
`npm run validate:legacy` harus menghasilkan angka di kisaran ini.
Selisih wajib dapat dijelaskan per-customer melalui reconciliation report (PRD §57).
