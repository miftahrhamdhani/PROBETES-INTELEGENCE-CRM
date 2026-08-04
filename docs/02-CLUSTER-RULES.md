# Aturan Klasifikasi Customer PROBETES — IMMUTABLE

> **DOKUMEN INI ADALAH ATURAN PERUSAHAAN.**
> Dilarang mengubah, menyederhanakan, atau menambah cluster.
> Perubahan hanya boleh atas permintaan tertulis pemilik proses bisnis,
> dan wajib menaikkan `rule_version`.

---

## 1. Sumber aturan (verbatim)

Disalin apa adanya dari dokumen perusahaan **"(BARU) KLASIFIKASI CUSTOMER PROBETES"**:

1. **CLUSTER A1** — Cluster A1 adalah F2 dan seterusnya yang sudah belanja 1,5juta exclude F1 dan Cluster B
2. **CLUSTER A2** — Cluster A2 adalah F2 exclude A1, Cluster B, Cluster C, F1, F3 dan seterusnya
3. **CLUSTER A3** — Cluster A3 adalah F3 exclude A1, Cluster B, F1, F2, F4 dan seterusnya
4. **CLUSTER A4** — Cluster A4 adalah F4 dan seterusnya exclude Cluster B, A1, F1, F2, F3
5. **CLUSTER B** — Cluster B adalah Data Yacona lebih dari F5
6. **CLUSTER C** — Dibagi 3:
   - **C-Prodig**: Data new cust ebook/buku (F1) dari bulan November 2025 sampai yang terbaru (now) yang sudah masuk Grup tapi belum melakukan pembelian kedua sama sekali
   - **C-HP**: Data new cust pembelian pertama herbal probetes dan/amandia yang masuk dari bulan November 2025 sampai yang terbaru (now) yang sudah masuk Grup tapi belum melakukan pembelian kedua sama sekali
   - **C-F2**: Data new customer yang pembelian pertama dan kedua adalah produk digital (ebook) dan belum melakukan pembelian ketiga tapi sudah masuk ke grup
7. **CLUSTER D** — Data new cust ebook dari bulan November-Now yang belum masuk Grup dan sama sekali belum melakukan pembelian kedua atau pembelian pertama dan kedua masih berupa e-book. Dibagi dua:
   - **D-New**: cluster D yang baru masuk dalam rentang waktu 15 hari sejak pertama kali pembelian
   - **D-Old**: cluster D yang masuk setelah 15 hari dari pembelian pertama
8. **CLUSTER Dhp** — Data new cust yang pembelian pertamanya adalah herbal probetes dan/atau amandia yang masuk mulai November 2025 - sekarang yang belum masuk Grup dan sama sekali belum melakukan pembelian kedua. Dibagi dua:
   - **Dhp-New**: cluster Dhp yang baru masuk di bulan eksis (misal saat ini bulan April, maka semua data new cust April masuk kategori New)
   - **Dhp-Old**: cluster Dhp yang masuk bulan sebelum bulan eksis
9. **CLUSTER E** — Data new cust ebook dari bulan Maret-Oktober 2025 sama sekali belum beli salah satu atau bundling dari produk berikut: herbal probetes, amandia sereal, amandia muesli, probetes oil, beras, minyak CCO, minyak kelapa, minyak VCO, stevia
10. **CLUSTER F** — Customer yang tidak masuk ke cluster A1, A2, A3, A4, B, C, D, dan E, masuk ke cluster F

**Catatan perusahaan:**
- Keluarkan semua data Yacona dari Cohort, kemudian kelompokkan kembali yang frekuensinya lebih dari 5x masuk ke cluster B
- Keluarkan data Yacona dari database, kemudian buat database sendiri untuk data Yacona di atas F5
- Yacona masih masuk produk yang dijual namun tidak dikategorikan produk Probetes, dan hanya dijual di CRM
- Produk yang diiklankan di akuisisi saat ini: Ebook dan Herbal Probetes
- Update data cust yang masuk grup oleh **Nayla**; pembagian data CRM oleh **Feny**
- Grup Konsultasi setiap bulan akan bertambah minimal 1 grup

---

## 2. Prioritas evaluasi — FIRST MATCH WINS

Evaluasi berurutan dari angka terkecil. Begitu cocok, berhenti.

> ✅ **Diverifikasi terhadap kode sumber sistem lama** (Google Apps Script,
> `getClusterData()` — lihat README aplikasi legacy) dan diuji ulang atas
> `01. database All.xlsx` + `DataKSB` + `masukWA`/`BackupMasukGrup`: run backend
> TypeScript production terakhir menghasilkan `|Δ| = 692` terhadap total legacy
> 15.626 customer (**~96% cocok**). Detail: [08-RECONCILIATION.md](08-RECONCILIATION.md).
> Urutan di bawah ini **menggantikan** dugaan awal (E sebelum A2/A3/A4) yang
> ternyata salah — koreksi terhadap encoding penulis, bukan terhadap aturan bisnis.

| Priority | Cluster |
|---:|---|
| 10 | B |
| 20 | A1 |
| 30 | C-Prodig |
| 31 | C-HP |
| 32 | C-F2 |
| 40 | D-New |
| 41 | D-Old |
| 50 | Dhp-New |
| 51 | Dhp-Old |
| 60 | A2 |
| 70 | A3 |
| 80 | A4 |
| 90 | E |
| 100 | F |

**Kenapa A1 paling atas (setelah B):** definisi A1 hanya meng-exclude B, sehingga
customer high-value (≥ Rp1.500.000) selalu menang atas kategori lifecycle apa pun.

**Kenapa C/D/Dhp di atas A2/A3/A4:** C-F2 dan D mensyaratkan F=2 dengan kriteria
produk+tanggal+grup yang spesifik — bertabrakan dengan A2 (F=2 generik). Sistem lama
menyelesaikan ini dengan mengecek kandidat C-F2/D lebih dulu (aturan spesifik menang
atas aturan generik), baru sisanya jatuh ke A2.

**Kenapa E di posisi paling akhir (sebelum F):** ini bagian paling non-obvious dan
**wajib dipahami sebelum mengubah kode apa pun di sini:**

> Teks aturan E ("Data new cust ebook dari bulan Maret-Oktober 2025 …") **tidak
> menyebutkan batasan Frequency sama sekali** — secara harfiah F1, F2, F3, dst semua
> bisa masuk E asal belum pernah beli produk fisik target. **Ini tidak diubah.**
>
> Tetapi karena A2 (F=2), A3 (F=3), A4 (F≥4) dievaluasi **lebih dulu** dan sifatnya
> catch-all untuk nilai F tersebut (asal M < Rp1,5jt dan tidak match C/D/Dhp), maka
> **setiap customer dengan F≥2 sudah tertangkap oleh A2/A3/A4 sebelum sempat dicek E** —
> kecuali kasus F=2 spesifik yang sudah didahulukan ke C-F2/D. Akibatnya E secara
> **efektif** hanya kebagian customer F=1. Ini bukan aturan tambahan yang kita
> paksakan — ini **konsekuensi logis dari urutan evaluasi**, dan cocok dengan
> perilaku sistem lama yang sudah diverifikasi di atas.
>
> **Implikasi untuk implementasi:** JANGAN menambahkan syarat `frequency === 1` ke
> kondisi cluster E. Cukup pastikan urutan prioritas di atas ditaati apa adanya
> (A2/A3/A4 sebelum E) — hasil F=1-only akan muncul dengan sendirinya dari mesin
> first-match-wins.

Jika perusahaan memutuskan urutan berbeda, **hanya tabel prioritas ini yang berubah** —
struktur database dan kode tidak perlu dirombak, karena setiap cluster tetap
diimplementasikan sebagai kondisi independen di `src/server/cluster/rules/`.

---

## 3. Prasyarat perhitungan

### 3.1 Pre-filter Yacona/KSB

> ✅ **Terverifikasi dari sumber data legacy** (`[Web Based] COHORT ANALYSIS -
> ALL PRODUCT.xlsx`, sheet `DataKSB`): *"Data Yacona"* dalam teks aturan berarti
> **seluruh lini produk KSB**, bukan hanya baris Yacona di Database All. KSB adalah
> lini bisnis terpisah dengan sheet transaksinya sendiri (42.681 baris, Mar 2022 – now),
> mencakup: **Yacona, Teacona, Bio Insuleaf, Zymuno, Nutriflakes, Probiogel** (+varian
> ejaan). Detail: [08-RECONCILIATION.md §1](08-RECONCILIATION.md).

```
1. yacona_frequency (lebih tepat: "ksb_frequency") = COUNT(DISTINCT tanggal transaksi)
   pada dataset KSB terpisah, BUKAN dari baris Yacona di dalam Database All
2. Dataset Probetes (Database All) dan dataset KSB adalah DUA SUMBER BERBEDA
3. Buang seluruh ITEM Yacona/KSB yang nyasar di Database All dari perhitungan F, M
   Probetes (jaga-jaga; harusnya sudah terpisah di sumbernya)
```

- Customer yang **hanya** punya transaksi KSB (tidak pernah muncul di Database All) →
  status `YACONA_NON_COHORT` (bukan cluster, bukan F) — **404 customer** kasus ini,
  lihat [08-RECONCILIATION.md](08-RECONCILIATION.md)
- Customer KSB + Probetes → transaksi Probetes tetap dihitung; kecuali
  `yacona_frequency > 5` → jadi B (prioritas tertinggi, menang atas semua cluster lain)
- Data KSB **tidak dihapus**, disimpan di tabel terpisah dan di-join hanya untuk B

### 3.2 Definisi order (Frequency)

> ✅ **Terverifikasi dari kode sumber sistem lama:** *"Freq = jumlah **hari unik**
> customer melakukan transaksi (bukan jumlah baris/qty), dihitung dari
> `uniqueDates.size`."* — bukan berdasarkan `idpesan`.

```
canonical_order_key = (order_date, normalized_phone)      -- SATU HARI = SATU ORDER
frequency           = COUNT(DISTINCT canonical_order_key) atas order Probetes
```

Konsekuensi: kalau customer bertransaksi 2× di tanggal yang sama (2 `idpesan` berbeda),
sistem lama menghitungnya sebagai **satu** order/hari untuk keperluan Frequency & Cluster.

> ⚠️ Ini menggabungkan order yang menurut [06-DATA-FINDINGS.md §2](06-DATA-FINDINGS.md)
> sebenarnya punya `idpesan` teks yang valid dan berbeda. Kita **mengikuti definisi
> sistem lama** demi kesetaraan angka bisnis (RFM/Cluster), TAPI `idpesan` asli tetap
> disimpan penuh di `order_items` untuk ketertelusuran — lihat [03-ERD.md](03-ERD.md).
> Order id (`idpesan`) dipakai untuk integritas item, **bukan** untuk Frequency.

### 3.3 as_of_date

```
as_of_date = MAX(order_date) dari ORDER PROBETES kanonik   ← BUKAN NOW()
recency_days      = as_of_date − last_order_date
customer_age_days = as_of_date − first_order_date
```

**Probetes-only, bukan "seluruh baris valid".** Transaksi KSB TIDAK PERNAH
memajukan `as_of_date`, walaupun tanggalnya lebih baru. Contoh: order Probetes
terakhir 1 Agu, ada transaksi Yacona 5 Agu → `as_of_date` tetap **1 Agu**.

Alasannya konsistensi: seluruh query analytics menghitung as_of dari
`MAX(orders.order_date)`, dan tabel `orders` hanya berisi Probetes (item KSB
sudah dipisah sejak parser). Kalau import memakai definisi berbeda,
`recency_days`/`customer_age_days` bergeser — dan lewat itu batas D-New/D-Old
(15 hari) serta Dhp-New/Dhp-Old (bulan berjalan) ikut salah.

Implementasi: `parseDatabaseAll` menghitung `asOfDate` dari daftar order final
(setelah item KSB dikeluarkan), bukan di dalam loop per baris.
Regression test: `tests/import.test.ts` → "as_of_date Probetes-only".

### 3.4 Monetary

```
order_total = SUM(Nilai Produk seluruh item dalam order)   -- item Yacona dikecualikan
monetary    = SUM(order_total seluruh order Probetes customer)
```

---

## 4. Kategori produk untuk cluster

Helper feature yang dipakai aturan:

| Feature | Isi |
|---|---|
| `is_ebook` | `EBOOK` |
| `is_book_entry` | `EBOOK` atau `BUKU_MENUJU_REMISI` |
| `is_hp_or_amandia` | `HERBAL_PROBETES`, `SEREAL_AMANDIA`, `AMANDIA_MUESLI` |
| `target_physical_products` | `HERBAL_PROBETES`, `SEREAL_AMANDIA`, `AMANDIA_MUESLI`, `PROBETES_OIL`, `BERAS`, `MINYAK_CCO`, `MINYAK_KELAPA`, `MINYAK_VCO`, `STEVIA` |

### 4.1 Kategori satu order (mixed order)

```
contains_hp_amandia  = ada item HP/Amandia dalam order
is_book_entry_order  = SELURUH item order adalah Ebook atau Buku
is_ebook_only_order  = SELURUH item order adalah Ebook
```

Sehingga order `Ebook + Herbal Probetes` **bukan** `EBOOK_ONLY` — customer sudah beli produk fisik.

### 4.2 Item bonus

Item bernilai **Rp 0 dengan nama mengandung "BONUS"** diabaikan saat menentukan
kategori order. Alasan: order `Ebook + Stevia Bonus` akan salah dianggap sudah
beli produk fisik, padahal Stevia-nya gratis.

> Ini keputusan interpretasi data, **bukan** perubahan aturan cluster.
> Terdaftar di [07-OPEN-QUESTIONS.md](07-OPEN-QUESTIONS.md) untuk konfirmasi.
> Item bonus tetap masuk `order_items` dan tetap dihitung di Monetary (nilainya Rp 0).

---

## 5. Definisi formal tiap cluster

### B — priority 10
```
yacona_frequency > 5          → B      -- dihitung dari dataset KSB terpisah, §3.1
```
Ambang: **lebih dari 5**, artinya `>= 6`. F tepat 5 bukan B.
Diverifikasi presisi terhadap sistem lama: 1.007 vs 1.006 (selisih 1 dari ±43.000 baris KSB).

### A1 — priority 20
```
frequency >= 2
AND monetary >= 1_500_000     → A1
```
Rp1.500.000 tepat **termasuk** A1.

### C-Prodig — priority 30
```
first_order_date >= 2025-11-01
AND frequency = 1
AND first_order mengandung Ebook/Buku
AND first_order TIDAK mengandung HP/Amandia
AND has_group = true          → C-Prodig
```

### C-HP — priority 31
```
first_order_date >= 2025-11-01
AND frequency = 1
AND first_order mengandung HP/Amandia
AND has_group = true          → C-HP
```

### C-F2 — priority 32
```
frequency = 2
AND order_1 = EBOOK_ONLY
AND order_2 = EBOOK_ONLY
AND has_group = true          → C-F2
```
Tidak ada batas tanggal pada C-F2 (sesuai teks aturan).

### D-New / D-Old — priority 40 / 41
```
first_order_date >= 2025-11-01
AND has_group = false
AND (
      (frequency = 1 AND first_order = EBOOK_ONLY)
   OR (frequency = 2 AND order_1 = EBOOK_ONLY AND order_2 = EBOOK_ONLY)
    )

customer_age_days <= 15  → D-New
customer_age_days >  15  → D-Old
```
Hari ke-15 masih D-New; hari ke-16 jadi D-Old.

### Dhp-New / Dhp-Old — priority 50 / 51
```
first_order_date >= 2025-11-01
AND frequency = 1
AND first_order mengandung HP/Amandia
AND has_group = false

bulan(first_order_date) = bulan(as_of_date)  → Dhp-New
bulan(first_order_date) < bulan(as_of_date)  → Dhp-Old
```

### A2 — priority 60
```
frequency = 2
AND monetary < 1_500_000
AND tidak match prioritas sebelumnya (A1, C-F2, D)   → A2
```

### A3 — priority 70
```
frequency = 3
AND monetary < 1_500_000
AND tidak match prioritas sebelumnya   → A3
```

### A4 — priority 80
```
frequency >= 4
AND monetary < 1_500_000
AND tidak match prioritas sebelumnya   → A4
```

### E — priority 90
```
first_order_date BETWEEN 2025-03-01 AND 2025-10-31
AND first_order = EBOOK
AND customer TIDAK PERNAH membeli target_physical_products   → E
```
Teks aturan tidak membatasi Frequency. **Tapi karena posisinya di priority 90**
(setelah A2/A3/A4), F≥2 sudah tertangkap duluan oleh A2/A3/A4 — sehingga secara
efektif hanya customer **F=1** yang sampai ke pengecekan ini. **Jangan menambahkan
syarat F=1 secara eksplisit ke kondisi E** — biarkan itu muncul dari urutan evaluasi.
Lihat penjelasan lengkap di [§2](#2-prioritas-evaluasi--first-match-wins).

### F — priority 100
```
customer eligible tapi tidak match apa pun   → F
```
**F bukan tempat pembuangan error data.** Data bermasalah → `NEEDS_REVIEW`.

---

## 6. Status non-cluster

| Status | Kapan | Catatan |
|---|---|---|
| `EXCLUDED_NO_PHONE` | No. HP kosong / invalid / tidak dapat diperbaiki | Tidak jadi canonical customer, tidak masuk RFM/Cohort/Cluster |
| `YACONA_NON_COHORT` | Customer hanya punya transaksi KSB (tidak pernah muncul di Database All), `yacona_frequency <= 5` | Bukan cluster F. **21.557 customer** (data pasca-migrasi KSB, 2026-07-31 — lihat [08-RECONCILIATION.md §6.4](08-RECONCILIATION.md)). Angka "±404" sebelumnya di sini keliru: itu adalah customer Cluster B yang KSB-murni (§3.2), bukan populasi status ini |
| `NEEDS_REVIEW` | Keputusan cluster bergantung produk `UNKNOWN` | Jangan diam-diam dijadikan F |

---

## 7. Konstanta

| Konstanta | Nilai | Dipakai |
|---|---|---|
| `A1_MONETARY_THRESHOLD` | `1_500_000` | A1, A2, A3, A4 |
| `CLUSTER_B_YACONA_MIN_FREQ` | `> 5` (≥ 6) | B |
| `LIFECYCLE_START_DATE` | `2025-11-01` | C-Prodig, C-HP, D, Dhp |
| `E_WINDOW_START` | `2025-03-01` | E |
| `E_WINDOW_END` | `2025-10-31` | E |
| `D_NEW_MAX_AGE_DAYS` | `15` | D-New / D-Old |

Semua tanggal di atas adalah **konstanta tetap** (penanda peristiwa bisnis),
bukan jendela bergeser. Belum dikonfirmasi — lihat [07-OPEN-QUESTIONS.md](07-OPEN-QUESTIONS.md).

---

## 8. Explainable cluster

Setiap assignment wajib menyimpan `reason` JSONB:

```json
{
  "matched_rule": "A1",
  "priority": 20,
  "rule_version": "1.0",
  "as_of_date": "2026-07-26",
  "frequency": 4,
  "monetary": 1850000,
  "yacona_frequency": 0,
  "has_group": false,
  "first_order_date": "2025-12-03",
  "checks": [
    { "label": "Frequency >= 2", "passed": true, "actual": 4 },
    { "label": "Monetary >= Rp1.500.000", "passed": true, "actual": 1850000 },
    { "label": "Bukan Cluster B", "passed": true, "actual": 0 }
  ]
}
```

---

## 9. Test wajib (harus hijau sebelum rilis)

| # | Skenario | Hasil |
|---|---|---|
| 1 | KSB (dataset terpisah) F6, tidak pernah muncul di Database All | `B` |
| 2 | KSB F5 saja, tidak pernah muncul di Database All | `YACONA_NON_COHORT` |
| 3 | F2, M = 1.500.000 | `A1` |
| 4 | F2, M = 1.499.999 | bukan A1 |
| 5 | F1 Ebook, Nov 2025, has_group | `C-Prodig` |
| 6 | F1 HP, Nov 2025, has_group | `C-HP` |
| 7 | F2 Ebook+Ebook, has_group | `C-F2` |
| 8 | F1 Ebook, no group, umur 15 hari | `D-New` |
| 9 | F1 Ebook, no group, umur 16 hari | `D-Old` |
| 10 | F1 HP, no group, bulan berjalan | `Dhp-New` |
| 11 | F1 HP, no group, bulan sebelumnya | `Dhp-Old` |
| 12 | First Ebook Mar–Okt 2025, F1, belum pernah produk fisik | `E` |
| 13 | F2 biasa (bukan kandidat C-F2/D) | `A2` |
| 14 | F3 biasa | `A3` |
| 15 | F4 biasa | `A4` |
| 16 | Tidak match apa pun | `F` |
| 17 | Order `Ebook + Herbal Probetes` | bukan `EBOOK_ONLY` |
| 18 | Order `Ebook + Stevia Bonus (Rp0)` | tetap `EBOOK_ONLY` |
| 19 | First Ebook Mar–Okt 2025, **F3**, semua ebook, belum pernah produk fisik | `A3`, **bukan** `E` (A3 dievaluasi lebih dulu — lihat §2) |
| 20 | First Ebook Mar–Okt 2025, M ≥ 1,5jt | `A1`, bukan `E` |
| 21 | Upload file sama 2× | state database identik |
| 22 | Customer transaksi 2× di tanggal sama (2 `idpesan` beda) | dihitung **1 order** (F bertambah 1, bukan 2) |
| 23 | F2 Ebook+Ebook, Nov 2025, **belum** masuk grup | `D-New`/`D-Old` — bukan `A2` (C/D dicek sebelum A2) |
