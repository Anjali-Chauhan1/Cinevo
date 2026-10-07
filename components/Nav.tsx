"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";
import { paise } from "@/lib/format";

export function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMenuOpen(false); setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    function dismiss(event: PointerEvent) { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setMenuOpen(false); setMobileOpen(false); if (menuOpen) trigger.current?.focus(); } }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);
  const links = <>
    <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Discover</Link>
    <Link href="/trending" aria-current={pathname === "/trending" ? "page" : undefined}>Explore films</Link>
    <Link href="/trending?filter=premieres">Premieres <span className="nav-dot" /></Link>
    {user?.platformRole === "ADMIN" && <Link href="/admin">Admin</Link>}
  </>;
  return <header className="site-header">
    <nav className="header-inner" aria-label="Main navigation">
      <Link href="/" className="brand" aria-label="Cinevo home"><span className="brand-mark"><Icon name="play" size={18} /></span>cinevo<span className="brand-period">.</span></Link>
      <div className="desktop-nav">{links}</div>
      <form action="/trending" className="header-search" role="search"><Icon name="search" size={17} /><input name="q" aria-label="Search films and creators" placeholder="Find your next favourite film" type="search" /></form>
      <div className="header-actions">
        <Link href={user?.creator ? "/studio" : "/become-creator"} className="creator-nav"><Icon name="plus" size={16} />{user?.creator ? "Creator studio" : "For filmmakers"}</Link>
        {!loading && (user ? <>
          <Link href="/wallet" className="balance-nav" aria-label={`Balance: ${paise(user.ledgerAccount?.balancePaise ?? 0)}`}><Icon name="wallet" size={17} />{paise(user.ledgerAccount?.balancePaise ?? 0)}</Link>
          <div className="account-wrap" ref={menu}>
            <button ref={trigger} className="avatar" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="account-menu" aria-label="Open account menu">{user.displayName.charAt(0).toUpperCase()}</button>
            {menuOpen && <div id="account-menu" className="account-menu"><p>{user.displayName}</p>
              <Link href="/profile">Your profile</Link><Link href="/wallet">Balance & subscriptions</Link>
              {user.creator && <Link href={`/c/${user.creator.handle}`}>Your channel</Link>}
              <Link href={user.creator ? "/studio" : "/become-creator"}>{user.creator ? "Creator studio" : "Start a channel"}</Link>
              <button onClick={async () => { await logout(); setMenuOpen(false); router.push("/"); }}>Sign out</button>
            </div>}
          </div>
        </> : <><Link href="/login" className="signin-link">Log in</Link><Link href="/signup" className="btn-primary signup-link">Join Cinevo <Icon name="arrow" size={15} /></Link></>)}
        <button className="mobile-toggle icon-button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen(!mobileOpen)}><Icon name={mobileOpen ? "close" : "menu"} /></button>
      </div>
    </nav>
    {mobileOpen && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setMobileOpen(false); }}>
      {links}<Link href={user?.creator ? "/studio" : "/become-creator"}>Creator studio</Link>
      <form action="/trending" role="search"><input className="input" name="q" aria-label="Search films and creators" placeholder="Search films or creators…" type="search" /><button className="btn-primary" type="submit">Search</button></form>
    </nav>}
  </header>;
}
