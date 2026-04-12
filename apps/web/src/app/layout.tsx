import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { DemoBanner } from "@/components/DemoBanner";
import { TRPCReactProvider } from "@/trpc/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bakery Management System",
  description: "Manage recipes, ingredients, suppliers, and orders for your bakery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <TRPCReactProvider>
          <Nav />
          {/* All pages sit to the right of the fixed sidebar */}
          <main className="lg:ml-60 min-h-screen pt-14 lg:pt-0">
          <DemoBanner />
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
          </main>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
