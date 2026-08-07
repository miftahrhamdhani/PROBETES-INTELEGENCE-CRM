import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Folder output build. Default `.next` — TAPI folder itu juga dipakai
   * `npm run dev` saat berjalan. Menjalankan `npm run build` sementara dev
   * server hidup akan menimpa chunk yang sedang dipakai dev server, dan
   * halaman langsung error `__webpack_modules__[moduleId] is not a function`
   * (atau kehilangan seluruh CSS) sampai dev server di-restart.
   *
   * Karena itu build verifikasi (CI, cek pra-deploy, pengukuran performa)
   * sebaiknya diarahkan ke folder lain lewat env var:
   *
   *   NEXT_BUILD_DIR=.next-verify npm run build
   *   NEXT_BUILD_DIR=.next-verify npx next start -p 3001
   *
   * Deploy Vercel tidak terpengaruh: env var itu tidak diset di sana, jadi
   * tetap memakai `.next` seperti biasa.
   */
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
