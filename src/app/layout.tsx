import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { LicenseFilter } from "./components/license-filter";
import { FloatingDevTools } from "./components/floating-devtools";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s · VeriSettle AI",
    default: "VeriSettle AI · Proof-Gated B2B Settlement",
  },
  description: "Proof-gated B2B payment authorization holds, multimodal 3-way invoice reconciliation and dispute defense for PayPal AI Hackathon 2026. Sandbox demo; not a regulated escrow service.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased dark bg-[#09090b] text-zinc-100`}
    >
      <body className="min-h-full flex flex-col bg-[#09090b] text-zinc-100 selection:bg-zinc-800 selection:text-white">
        <LicenseFilter />
        {children}
        <FloatingDevTools />
      </body>
    </html>
  );
}
