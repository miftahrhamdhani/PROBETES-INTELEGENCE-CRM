import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WorkspaceMasterDataRedirect({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value != null) query.set(key, value);
  });
  redirect(`/workspace/master-produk${query.size ? `?${query}` : ""}`);
}
