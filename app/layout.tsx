import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Presença do Embaixador",
  description: "Lançamento de data, evento e presença direto na planilha do Embaixador.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Presença",
  },
  icons: {
    icon: "/logo-er.png",
    shortcut: "/logo-er.png",
    apple: "/logo-er.png",
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
