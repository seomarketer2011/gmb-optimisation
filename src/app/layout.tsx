import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GBP Optimisation",
  description:
    "Plan, prepare and track Google Business Profile optimisation work",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
