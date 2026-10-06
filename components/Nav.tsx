"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { paise } from "@/lib/format";

export function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-[var(--text)]">
          <span className="text-[var(--accent)]">●</span> Cinevo
        </Link>

        <div className="hidden items-center gap-5 text-sm text-[var(--text-dim)] md:flex">
          <Link href="/" className="hover:text-[var(--text)]">Home</Link>
          <Link href="/trending" className="hover:text-[var(--text)]">Trending</Link>
          {user?.creator && (
            <Link href="/studio" className="hover:text-[var(--text)]">Studio</Link>
          )}
          {!user?.creator && user && (
            <Link href="/become-creator" className="hover:text-[var(--text)]">Become a creator</Link>
          )}
          {user?.platformRole === "ADMIN" && (
            <Link href="/admin" className="hover:text-[var(--text)]">Admin</Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <>
              <Link
                href="/wallet"
                className="hidden rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surface-raised)] sm:block"
              >
                {paise(user.ledgerAccount?.balancePaise ?? 0)}
              </Link>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-raised)] text-sm font-semibold"
                >
                  {user.displayName.charAt(0).toUpperCase()}
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-dim)]">
                      {user.displayName}
                    </div>
                    <Link href="/wallet" className="block px-3 py-2 text-sm hover:bg-[var(--surface-raised)] sm:hidden">
                      Wallet · {paise(user.ledgerAccount?.balancePaise ?? 0)}
                    </Link>
                    <Link href="/profile" className="block px-3 py-2 text-sm hover:bg-[var(--surface-raised)]">
                      Profile
                    </Link>
                    {user.creator && (
                      <Link href={`/c/${user.creator.handle}`} className="block px-3 py-2 text-sm hover:bg-[var(--surface-raised)]">
                        My channel
                      </Link>
                    )}
                    <button
                      onClick={async () => {
                        await logout();
                        setMenuOpen(false);
                        router.push("/");
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-[var(--surface-raised)]"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">Sign in</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
