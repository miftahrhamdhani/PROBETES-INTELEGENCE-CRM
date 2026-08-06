/**
 * SHARED — Exact Product Master seed, Workspace CRM V1 (docs prompt §5.1).
 * Sumber tunggal: dipakai `scripts/seed-workspace-products.ts` (tulis ke DB)
 * DAN `tests/workspace-master-data.test.ts` (verifikasi tidak ada yang
 * berubah diam-diam). DILARANG mengubah productId/productName/sellingPrice/
 * unitHpp/productUsage di sini tanpa persetujuan eksplisit — lihat ATURAN
 * MUTLAK di prompt implementasi ("Jangan mengubah Product ID... Jangan
 * membuat Product ID sendiri").
 */

export type WorkspaceProductUsage = "SELLABLE" | "BONUS_ONLY" | "SELLABLE_AND_BONUS" | "INACTIVE";

export interface WorkspaceProductSeed {
  productId: string;
  productName: string;
  sellingPrice: number | null;
  unitHpp: number;
  productUsage: WorkspaceProductUsage;
  description: string;
}

export const WORKSPACE_PRODUCT_SEED: readonly WorkspaceProductSeed[] = [
  { productId: "PRO-0001", productName: "Amandia Sereal", sellingPrice: 75000, unitHpp: 33750, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0002", productName: "Amandia Muesli", sellingPrice: 54000, unitHpp: 32000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0003", productName: "Beras Organik", sellingPrice: 42500, unitHpp: 30000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0004", productName: "Beras Merah", sellingPrice: 42500, unitHpp: 30000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0005", productName: "Buku Kurus", sellingPrice: 135000, unitHpp: 45000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0006", productName: "Buku Remisi", sellingPrice: 89000, unitHpp: 45000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0007", productName: "Ebook 101", sellingPrice: 69000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0008", productName: "Ebook 90", sellingPrice: 89000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0009", productName: "Ebook 145", sellingPrice: 145000, unitHpp: 35000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0010", productName: "Ebook 30", sellingPrice: 69000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0011", productName: "Ebook 69", sellingPrice: 69000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0012", productName: "Ebook Fat Loss", sellingPrice: 69000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0013", productName: "Ebook Haji", sellingPrice: 69000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0014", productName: "Ebook Hipertensi", sellingPrice: 69000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0015", productName: "Ebook Webinar", sellingPrice: 89000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0016", productName: "Konsul Pak Rahman", sellingPrice: 125000, unitHpp: 62500, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0017", productName: "Minyak CCO", sellingPrice: 60000, unitHpp: 40000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0018", productName: "Minyak VCO", sellingPrice: 60000, unitHpp: 48050, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0019", productName: "Probetes Herbal 24", sellingPrice: 99000, unitHpp: 27000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0020", productName: "Probetes Oil", sellingPrice: 65000, unitHpp: 22000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0021", productName: "Stevia", sellingPrice: 45000, unitHpp: 20000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "KSB-0001", productName: "Yacona 60", sellingPrice: 185000, unitHpp: 113320, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "KSB-0002", productName: "Teacona", sellingPrice: 68000, unitHpp: 42850, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0022", productName: "PBH 70", sellingPrice: 85000, unitHpp: 42500, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
  { productId: "PRO-0023", productName: "Pro Herbal Dummy", sellingPrice: null, unitHpp: 14000, productUsage: "BONUS_ONLY", description: "Bonus Product" },
  { productId: "PRO-0024", productName: "Ebook Ramadhan", sellingPrice: 89000, unitHpp: 25000, productUsage: "SELLABLE_AND_BONUS", description: "Product for sale" },
] as const;

/** item_type diperbolehkan untuk product_usage tertentu — dipakai UI (filter
 *  combobox produk per item_type) dan validasi backend (docs prompt §6.3.3). */
export function allowedItemTypesForUsage(usage: WorkspaceProductUsage): Array<"SALE" | "BONUS" | "SAMPLE"> {
  switch (usage) {
    case "SELLABLE":
      return ["SALE"];
    case "BONUS_ONLY":
      return ["BONUS", "SAMPLE"];
    case "SELLABLE_AND_BONUS":
      return ["SALE", "BONUS", "SAMPLE"];
    case "INACTIVE":
      return [];
  }
}
