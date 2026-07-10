import type { LucideIcon } from "lucide-react";

export type AppNavigationPath =
  "/interview-hub" | "/resumes" | "/interviews" | "/bank" | "/settings";

export type AppNavigationItem = {
  label: string;
  description: string;
  to: AppNavigationPath;
  icon: LucideIcon;
};

export type AppNavigationGroup = {
  label: string;
  items: AppNavigationItem[];
};
