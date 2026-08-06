import type { UserRole } from "@/lib/roles";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    mustChangePassword?: boolean;
  }

  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      role?: UserRole;
      mustChangePassword?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    mustChangePassword?: boolean;
  }
}
