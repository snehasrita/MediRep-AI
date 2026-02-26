import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SWRProvider } from "@/lib/swr-provider";
import { AuthProvider } from "@/lib/context/AuthContext";

const geistSans = localFont({
  src: "../public/fonts/geist.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "100 900",
});

const geistMono = localFont({
  src: "../public/fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
});

const playfair = localFont({
  src: "../public/fonts/playfair-display.woff2",
  variable: "--font-playfair",
  display: "swap",
  weight: "400 900",
});

// Space Grotesk - Modern geometric sans-serif (similar to GC Gatuzo)
const spaceGrotesk = localFont({
  src: "../public/fonts/space-grotesk.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "300 700",
});

export const metadata: Metadata = {
  title: "MediRep AI - Medical Representative Assistant",
  description: "AI-powered medical representative assistant for drug information, interactions, and safety alerts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="medirep-theme-v2"
          disableTransitionOnChange
        >
          <SWRProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
            <Toaster />
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
