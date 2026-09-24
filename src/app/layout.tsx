import type { Metadata } from "next";

import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kalshi Research Dashboard",
  description:
    "Read-only dashboard over the Kalshi research continuity store.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SidebarProvider>
          {/* Family list arrives from the store in P2 (FR-015); empty until wired. */}
          <AppSidebar families={[]} />
          <SidebarInset>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground">
                Kalshi Research Dashboard
              </span>
            </header>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}