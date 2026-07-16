/** app-shell - 应用侧边栏导航 */
import { Link } from "@tanstack/react-router";
import { Bot, ChevronUp, LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAVIGATION, APP_VERSION } from "../constants";
import { useAppNavigation } from "../hooks/use-app-navigation";
import type { Profile } from "@/features/profile/types";

/**
 * app sidebar
 *
 * @param userEmail -
 * @returns
 */
export function AppSidebar({ userEmail, profile }: { userEmail?: string; profile?: Profile | null }) {
  const navigation = useAppNavigation();
  const { setOpenMobile } = useSidebar();

  const label = profile?.displayName || userEmail || "当前账户";
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="EZMock AI 面试">
              <Link to="/interview-hub" onClick={() => setOpenMobile(false)}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                  <Bot className="size-5" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">EZMock</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">AI 面试训练</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {APP_NAVIGATION.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={navigation.isActive(item.to)}
                        tooltip={item.label}
                        className="min-h-11"
                      >
                        <Link to={item.to} onClick={() => setOpenMobile(false)}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="px-2 text-[11px] text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">
          {APP_VERSION}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip="账户菜单">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                    {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="size-full object-cover" /> : label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left text-xs">
                    {label}
                  </span>
                  <ChevronUp className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {label}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={navigation.signingOut}
                  onSelect={() => void navigation.handleSignOut()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut />
                  {navigation.signingOut ? "正在退出…" : "退出登录"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
