/** interview-hub：首页右上角轻量账户菜单，保留辅助功能的可达性。 */
import { Link } from "@tanstack/react-router";
import { BookOpen, FileClock, FileUser, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthenticatedUser } from "@/features/auth-session/hooks/use-authenticated-user";

// 菜单不请求业务列表，只提供历史、简历、题库和设置的独立路由入口。
export function InterviewHomeAccountMenu() {
  const { user } = useAuthenticatedUser();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-full bg-card"
          aria-label="打开账户菜单"
        >
          <UserRound className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user?.email ?? "当前账户"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/history">
            <FileClock />
            面试历史
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/resumes">
            <FileUser />
            简历库
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/bank">
            <BookOpen />
            公共题库
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings />
            设置
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
