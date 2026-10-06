import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Nav } from "@/components/Nav";
import { CronPing } from "@/components/CronPing";

export const metadata: Metadata = {
  title: "Cinevo — Twitch for indie filmmakers",
  description:
    "Creators run their own channels. Fans subscribe, tip and back the next film. Creators get paid every second they're watched.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <CronPing />
          <Nav />
          <main className="mx-auto min-h-[calc(100vh-57px)] max-w-6xl px-4 py-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
