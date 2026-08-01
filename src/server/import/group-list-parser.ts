import { normalizePhone } from "../normalize/phone";
import { cleanText } from "../normalize/text";
import type { ExcludedRow, GroupListEntry, SourceRow, ValidationCode } from "./types";

export interface GroupListParseResult {
  entries: GroupListEntry[];
  excluded: ExcludedRow[];
  totalSourceRows: number;
}

export function parseGroupListRows(rows: SourceRow[], sourceList: string): GroupListParseResult {
  const entries = new Map<string, GroupListEntry>();
  const excluded: ExcludedRow[] = [];

  for (const row of rows) {
    const phone = normalizePhone(row.values["No HP"]);
    const codes: ValidationCode[] = [];
    if (phone.status === "MISSING") codes.push("MISSING_PHONE");
    else if (phone.status === "INVALID") codes.push("INVALID_PHONE");

    if (codes.length || phone.status !== "VALID") {
      excluded.push({ rowNumber: row.rowNumber, codes, raw: row.values });
      continue;
    }

    entries.set(phone.normalized, {
      normalizedPhone: phone.normalized,
      name: cleanText(row.values["Nama"]),
      sourceList,
      sourceRowNumber: row.rowNumber,
    });
  }

  return { entries: [...entries.values()], excluded, totalSourceRows: rows.length };
}
