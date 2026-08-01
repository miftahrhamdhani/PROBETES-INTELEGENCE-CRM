"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label="Ganti mode terang atau gelap"
      title="Ganti mode terang atau gelap"
    >
      <Moon className="h-3.5 w-3.5 dark:hidden" aria-hidden="true" />
      <Sun className="hidden h-3.5 w-3.5 dark:block" aria-hidden="true" />
    </Button>
  );
}
