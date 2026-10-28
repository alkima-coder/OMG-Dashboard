import type { Metadata } from "next";
import { Nunito_Sans, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OMG Dashboard - Performance Tracker",
  description: "Unified commerce, media and SKU performance analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full antialiased", nunitoSans.variable, inter.variable)}>
      <body className="min-h-full flex flex-col font-sans bg-[#f8fafc] text-slate-900 dark:bg-[#090d16] dark:text-slate-100 transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
