/** SHARED — ukuran batch infinite scroll. Konstanta murni, tanpa I/O — "use
 *  server" file (customers-actions.ts, crm-reports-actions.ts) hanya boleh
 *  meng-export async function, jadi konstanta ini harus tinggal di luar situ. */
export const CUSTOMER_LIST_CHUNK = 60;
export const CRM_REPORT_LIST_CHUNK = 60;
export const WORKSPACE_TASK_LIST_CHUNK = 60;
