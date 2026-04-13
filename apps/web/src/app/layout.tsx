import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { TRPCReactProvider } from "@/trpc/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sucré — Bakery Management",
  description: "Manage recipes, ingredients, suppliers, and orders for your bakery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>
          <Nav />
          {/* Content sits below the fixed top nav (~108px tall) */}
          <main className="pt-[108px] min-h-screen">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
          </main>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
