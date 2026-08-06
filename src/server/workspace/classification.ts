import { createHash } from "node:crypto";
import { CRM_MAPPING_VERSION, type CrmTransactionStatus } from "@/lib/crm-workspace-contracts";
import { normalizeForMatching } from "@/server/normalize/text";

export type CrmClassificationInput = {
  division: unknown;
  platform: unknown;
};

export type CrmClassification = {
  included: boolean;
  inclusionReason: "DIVISION_CRM" | "SOURCE_MAPPED_TO_CRM" | null;
  exclusionReason:
    | "EXCLUDED_MARKETPLACE"
    | "EXCLUDED_ACQUISITION"
    | "EXCLUDED_NON_CRM_DIVISION"
    | "CONFLICT_EXCLUSION_WINS"
    | null;
  mappingVersion: string;
};

const MARKETPLACE = /\b(TIKTOK|TIKTOK MP|MARKETPLACE|SHOPEE|TOKOPEDIA|LAZADA|BLIBLI)\b/;
const ACQUISITION = /\b(META|AKUISISI|ACQUISITION)\b/;

/** Exclusion selalu menang; ADV sengaja tidak menjadi input. */
export function classifyCrmTransaction(
  input: CrmClassificationInput,
  mappingVersion = CRM_MAPPING_VERSION
): CrmClassification {
  const division = normalizeForMatching(input.division);
  const platform = normalizeForMatching(input.platform);
  const includedByDivision = division === "CRM";
  const marketplace = MARKETPLACE.test(`${division} ${platform}`);
  const acquisition = ACQUISITION.test(`${division} ${platform}`) || division === "META";

  if (marketplace || acquisition) {
    return {
      included: false,
      inclusionReason: includedByDivision ? "DIVISION_CRM" : null,
      exclusionReason: includedByDivision
        ? "CONFLICT_EXCLUSION_WINS"
        : marketplace
          ? "EXCLUDED_MARKETPLACE"
          : "EXCLUDED_ACQUISITION",
      mappingVersion,
    };
  }
  if (!includedByDivision) {
    return {
      included: false,
      inclusionReason: null,
      exclusionReason: "EXCLUDED_NON_CRM_DIVISION",
      mappingVersion,
    };
  }
  return {
    included: true,
    inclusionReason: "DIVISION_CRM",
    exclusionReason: null,
    mappingVersion,
  };
}

export type FingerprintItem = { product: string; qty: string | number | null; amount: bigint | string | number };

export function createOrderFingerprint(input: {
  source: string;
  orderDate: string;
  normalizedPhone: string;
  customerName: string;
  csName?: string | null;
  total: bigint | string | number;
  items: FingerprintItem[];
}): string {
  const products = input.items
    .map((item) => [normalizeForMatching(item.product), String(item.qty ?? ""), String(item.amount)].join(":"))
    .sort()
    .join(";");
  const canonical = [
    "v1",
    normalizeForMatching(input.source),
    input.orderDate,
    input.normalizedPhone,
    normalizeForMatching(input.customerName),
    products,
    String(input.total),
    normalizeForMatching(input.csName),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function normalizeTransactionStatus(value: unknown): CrmTransactionStatus {
  const status = normalizeForMatching(value);
  if (/BATAL|CANCEL/.test(status)) return "CANCELLED";
  if (/COD.*GAGAL|GAGAL.*COD/.test(status)) return "COD_FAILED";
  if (/PARTIAL|SEBAGIAN/.test(status) && /REFUND|RETUR|RETURN/.test(status)) return "PARTIALLY_REFUNDED";
  if (/REFUND/.test(status)) return "REFUNDED";
  if (/RETUR|RETURN/.test(status)) return "RETURNED";
  return "CONFIRMED";
}
