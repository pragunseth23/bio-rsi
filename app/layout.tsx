import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Proof of Discovery · Molecular optimization",
  description:
    "Recursive molecular optimization with a verifiable experiment trail.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
