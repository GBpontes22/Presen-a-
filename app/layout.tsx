import type { Metadata, Viewport } from "next";
import "./globals.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => `${BASE_PATH}${path}`;

export const metadata: Metadata = {
  title: "Presença do Embaixador",
  description: "Lançamento de data, evento e presença direto na planilha do Embaixador.",
  manifest: withBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Presença",
  },
  icons: {
    icon: withBasePath("/logo-er.png"),
    shortcut: withBasePath("/logo-er.png"),
    apple: withBasePath("/logo-er.png"),
  },
};

export const viewport: Viewport = {
  themeColor: "#08056f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
