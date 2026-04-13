import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { TRPCReactProvider } from "@/trpc/client";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bakery Management",
  description: "Manage recipes, ingredients, suppliers, and orders for your bakery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('bms-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}` }} />
      </head>
      <body>
        <TRPCReactProvider>
          <ThemeProvider>
            <Nav />
            <main className="pt-[56px] min-h-screen">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {children}
              </div>
            </main>
          </ThemeProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
