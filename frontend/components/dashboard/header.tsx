"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, User, Settings } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import Link from "next/link";

interface AppHeaderProps {
  userEmail?: string | null;
  userAvatar?: string | null;
}

export default function AppHeader({ userEmail, userAvatar }: AppHeaderProps) {
  const initials = userEmail
    ? userEmail
        .split("@")[0]
        .slice(0, 2)
        .toUpperCase()
    : "U";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b px-4 bg-card shadow-sm">
      <SidebarTrigger />
      <div className="flex items-center gap-2"></div>
      <div className="ml-auto flex items-center gap-4">
        <ModeToggle />
        {userEmail && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={userAvatar || undefined} alt={userEmail} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Account</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link href="/account">
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/account">
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <form action={signOut}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
