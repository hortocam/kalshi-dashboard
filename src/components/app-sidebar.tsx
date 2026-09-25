"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Left sidebar shell (FR-015). `families` is derived from the store by the
 * server layout in P2; until then the families group renders the agreed
 * "no families" placeholder, never a hard-coded family list.
 */
export function AppSidebar({ families }: { families: string[] }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1.5">
          <span className="text-sm font-semibold">Kalshi Research</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link href="/">
                    <Home />
                    <span>Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Market families</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {families.length === 0 ? (
                <SidebarMenuItem>
                  <span className="px-2 py-1 text-xs text-muted-foreground">
                    no families
                  </span>
                </SidebarMenuItem>
              ) : (
                families.map((family) => (
                  <SidebarMenuItem key={family}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === `/markets/${family}`}
                    >
                      <Link href={`/markets/${encodeURIComponent(family)}`}>
                        <span>{family}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}