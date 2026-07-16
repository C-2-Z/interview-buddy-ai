/** app-shell - 应用外壳布局与路由出口 */
import { useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import type { Profile } from "@/features/profile/types";
import { getApiOrigin } from "@/shared/runtime/runtime-config";

/**
 * app shell
 *
 * @param children -
 * @param userEmail -
 * @returns
 */
export function AppShell({ children, userEmail, profile }: { children: ReactNode; userEmail?: string; profile?: Profile | null }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    const origin = getApiOrigin();
    if (!origin) return;
    if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        跳到主要内容
      </a>
      <AppSidebar userEmail={userEmail} profile={profile} />
      <SidebarInset className="min-h-dvh overflow-x-hidden">
        <header
          data-print-hidden="true"
          className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/92 px-4 backdrop-blur md:hidden"
        >
          <SidebarTrigger className="size-11" aria-label="打开导航" />
          <div className="text-sm font-semibold">EZMock AI 面试训练</div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
