import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { LabProvider } from "@/components/lab/lab-provider";
import { LabShell } from "@/components/lab/lab-shell";

// Plex for text and data (an instrument-maker's typeface); Newsreader for editorial headings.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});
const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Proof of Discovery · Molecular optimization",
  description:
    "Evolutionary molecular optimization scored with RDKit, with a verifiable SHA-256 experiment trail.",
};

export const viewport: Viewport = {
  themeColor: "#eef0f4",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <LabProvider>
          <LabShell>{children}</LabShell>
        </LabProvider>
      </body>
    </html>
  );
}
