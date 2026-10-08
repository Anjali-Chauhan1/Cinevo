import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Nav } from "@/components/Nav";
import { CronPing } from "@/components/CronPing";
import { OnchainProvider } from "@/components/web3/Onchain";

export const metadata: Metadata = {
  title: "Cinevo — Independent stories. Shared together.",
  description:
    "Creators run their own channels. Fans subscribe, tip and back the next film. Creators get paid every second they're watched.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){var t;try{t=localStorage.getItem('cinevo-theme')}catch(e){}document.documentElement.dataset.theme=t==='light'||t==='dark'?t:window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()` }} /></head>
      <body className="antialiased">
        <OnchainProvider>
        <AuthProvider>
          <CronPing />
          <a href="#main-content" className="skip-link">Skip to content</a>
          <Nav />
          <main id="main-content" className="site-main">{children}</main>
          <footer className="site-footer"><a href="/" className="brand">cinevo<span className="brand-period">.</span></a><p>Independent stories. Shared together.</p><a href="/become-creator">Your story belongs here ↗</a></footer>
        </AuthProvider>
        </OnchainProvider>
      </body>
    </html>
  );
}
