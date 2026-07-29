import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Presença Embaixada",
  description: "Controle de presença para reuniões da Embaixada.",
  icons: {
    icon: "/logo-er.png",
    shortcut: "/logo-er.png",
  },
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
