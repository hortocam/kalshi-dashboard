import type { Metadata } from "next";

import { AppSidebar } from "@/components/app-sidebar";
import { listFamilies } from "@/lib/store/families";
import { openStore } from "@/lib/store/open";
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

/**
 * Family entries derive from the store at render time (FR-015): a family
 * added to the store appears without code changes. When the store is not
 * readable the sidebar falls back to its "no families" placeholder — the
 * pages themselves render the dedicated failure states.
 */
async function loadSidebarFamilies(): Promise<string[]> {
  try {
    const config = (await import("@/lib/config")).loadConfig();
    const store = openStore(config.researchDbPath);
    try {
      return (await listFamilies(store)).map((f) => f.family);
    } finally {
      store.close();
    }
  } catch {
    return [];
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const families = await loadSidebarFamilies();
  return (
    <html lang="en">
      <body className="antialiased">
        <SidebarProvider>
          <AppSidebar families={families} />
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