"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      className={cn(
        // Dipakai satu-satunya tempat: GlobalHeader (biru di mode terang) —
        // outline default (text-foreground gelap) nyaris tak terlihat di atas
        // biru, jadi warnanya ditimpa langsung di sini.
        "border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
        "dark:border-input dark:bg-card dark:text-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
      )}
    >
      <Moon className="h-3.5 w-3.5 dark:hidden" aria-hidden="true" />
      <Sun className="hidden h-3.5 w-3.5 dark:block" aria-hidden="true" />
    </Button>
  );
}
