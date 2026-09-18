import type { Metadata } from "next";
import { Instrument_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { AppProviders } from "@/components/providers/AppProviders";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FF Copilot — Your fantasy football workspace",
  description: "Fresh player data, source rankings, and every fantasy team in one focused workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem('ff-theme')==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}` }} /></head>
      <body
        className={`${instrumentSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>
          <Header />
          <main className="min-h-[calc(100vh-6.75rem)] has-[[data-copilot-mobile]]:min-h-dvh sm:min-h-[calc(100vh-3.5rem)]">
            {children}
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
