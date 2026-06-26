import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iiko Chef MVP",
  description: "Первичная проверка доступа к iiko и вывода полуфабрикатов",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
