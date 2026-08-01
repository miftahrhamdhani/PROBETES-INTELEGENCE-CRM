import { Client } from "@neondatabase/serverless";

export type TransactionClient = Client;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum dikonfigurasi");
  return url;
}

export async function withTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T> {
  const client = new Client(getDatabaseUrl());
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
