/** SHARED — tipe daftar & detail CRM Report. Uang dikirim sebagai string rupiah
 *  mentah (bukan bigint) supaya bisa diserialisasi ke Client Component. */
export type CrmReportItem = {
  id: number | null;
  lineNo: number;
  productName: string;
  qty: string;
  productValue: string;
  itemNote: string | null;
};

export type CrmReportRow = {
  id: number;
  customerId: number | null;
  customerName: string;
  phone: string;
  address: string | null;
  city: string | null;
  recipientDistrict: string | null;
  expedition: string | null;
  paymentMethod: string | null;
  csName: string | null;
  advName: string | null;
  platform: string | null;
  division: string | null;
  salesType: string | null;
  reportDate: string;
  totalQty: string;
  totalProductValue: string;
  shippingCost: string;
  packingCost: string;
  discount: string;
  adminCod: string;
  totalPayment: string;
  itemsSummary: string;
  archivedAt: string | null;
  createdByName: string | null;
  /** Terisi hanya kalau laporan tertaut ke task Workspace (crm_reports.task_id) — null berarti laporan berdiri sendiri. */
  taskId: number | null;
  taskType: string | null;
  taskStatus: string | null;
  taskOutcome: string | null;
  taskPicName: string | null;
};

export type CrmReportListResult = {
  rows: CrmReportRow[];
  total: number;
  page: number;
  perPage: number;
};

export type CrmReportDetail = {
  id: number;
  customerId: number | null;
  customerName: string;
  phone: string;
  address: string | null;
  expedition: string | null;
  memo: string | null;
  paymentMethod: string | null;
  items: CrmReportItem[];
  shippingCost: string;
  packingCost: string;
  discount: string;
  adminCod: string;
  totalPayment: string;
  csName: string | null;
  advName: string | null;
  note: string | null;
  hub: string | null;
  city: string | null;
  reportDate: string;
  orderClosingCount: number | null;
  salesType: string | null;
  platform: string | null;
  division: string | null;
  dataReceivedCount: number | null;
  crmVoucher: string | null;
  codValue: string;
  recipientDistrict: string | null;
  recipientPostalCode: string | null;
  partner: string | null;
  crmMarketingCost: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
};
