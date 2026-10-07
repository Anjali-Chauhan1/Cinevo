import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Nav } from "@/components/Nav";
import { CronPing } from "@/components/CronPing";

export const metadata: Metadata = {
  title: "Cinevo — Independent stories. Shared together.",
  description:
    "Creators run their own channels. Fans subscribe, tip and back the next film. Creators get paid every second they're watched.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <CronPing />
          <a href="#main-content" className="skip-link">Skip to content</a>
          <Nav />
          <main id="main-content" className="site-main">{children}</main>
          <footer className="site-footer"><a href="/" className="brand">cinevo<span className="brand-period">.</span></a><p>Independent stories. Shared together.</p><a href="/become-creator">Your story belongs here ↗</a></footer>
        </AuthProvider>
      </body>
    </html>
  );
}
