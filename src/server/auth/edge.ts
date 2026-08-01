import NextAuth from "next-auth";
import { authConfig } from "./config";

/** Instance tanpa provider DB — aman untuk edge runtime (middleware). */
export const { auth: authEdge } = NextAuth(authConfig);
