"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown"
      className={cn("p-3", className)}
      classNames={{
        root: cn(defaultClassNames.root, "text-xs"),
        months: "flex flex-col gap-2",
        month: "flex flex-col gap-3",
        month_caption: "flex items-center justify-center gap-2 px-10 pt-1",
        caption_label: "flex items-center gap-1 pointer-events-none",
        dropdowns: "flex items-center gap-1.5 text-xs font-medium",
        dropdown_root:
          "relative inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-1 hover:bg-accent focus-within:ring-2 focus-within:ring-ring",
        dropdown: "absolute inset-0 cursor-pointer opacity-0",
        months_dropdown: "text-xs",
        years_dropdown: "text-xs",
        nav: "flex items-center justify-between absolute inset-x-1 top-1 z-10",
        button_previous: cn(
          "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
        ),
        button_next: cn(
          "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
        week: "flex w-full mt-1",
        day: "relative w-9 h-9 p-0 text-center focus-within:relative focus-within:z-20",
        day_button: cn(
          "h-9 w-9 rounded-md text-xs font-normal text-foreground transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ),
        range_start: "day-range-start rounded-l-md bg-primary text-primary-foreground",
        range_end: "day-range-end rounded-r-md bg-primary text-primary-foreground",
        range_middle: "bg-accent text-accent-foreground rounded-none",
        selected: "bg-primary text-primary-foreground",
        today: "font-semibold text-primary underline underline-offset-4",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30 line-through",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) => {
          if (orientation === "left") return <ChevronLeft className="h-4 w-4" {...chevronProps} />;
          if (orientation === "down") return <ChevronDown className="h-3 w-3 opacity-60" {...chevronProps} />;
          return <ChevronRight className="h-4 w-4" {...chevronProps} />;
        },
      }}
      {...props}
    />
  );
}
