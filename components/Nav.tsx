"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Icon, type IconName } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Nav() {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    function escape(e: KeyboardEvent) { if (e.key === "Escape" && open) { setOpen(false); toggle.current?.focus(); } }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  const items: { href: string; label: string; icon: IconName; active?: boolean }[] = [
    { href: "/discover", label: "Home", icon: "home", active: pathname === "/discover" || pathname === "/" },
    { href: "/trending", label: "Explore films", icon: "film", active: pathname === "/trending" },
    { href: "/trending?filter=premieres", label: "Premieres", icon: "live" },
    { href: "/profile", label: "My community", icon: "users", active: pathname === "/profile" },
    { href: "/wallet", label: "My balance", icon: "wallet", active: pathname === "/wallet" },
    { href: user?.creator ? "/studio" : "/become-creator", label: "Creator studio", icon: "plus", active: pathname.startsWith("/studio") || pathname === "/become-creator" },
  ];
  return <>
    <header className="mobile-app-header"><Link href="/" className="brand"><span>Ci</span>nevo<span className="brand-period">.</span></Link><button ref={toggle} className="icon-button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"} /></button></header>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside id="app-sidebar" className={`app-sidebar ${open ? "is-open" : ""}`}>
      <Link href="/" className="brand sidebar-brand" aria-label="Cinevo home"><span>Ci</span>nevo<span className="brand-period">.</span></Link>
      <p className="sidebar-caption">YOUR CINEMA, YOUR WAY</p>
      <nav aria-label="Main navigation" className="sidebar-links" onClick={() => setOpen(false)}>{items.map(item => <Link key={item.label} href={item.href} aria-current={item.active ? "page" : undefined}><Icon name={item.icon} size={18} />{item.label}{item.icon === "live" && <span className="nav-dot" />}</Link>)}{user?.platformRole === "ADMIN" && <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined}><Icon name="settings" size={18} />Admin</Link>}</nav>
      <div className="sidebar-note"><span className="sidebar-note-icon"><Icon name="film" size={24} /></span><strong>Small films.<br />Big feelings.</strong><p>Discover a story that stays with you.</p><Link href="/trending?filter=free" onClick={() => setOpen(false)}>Find a film <Icon name="arrow" size={14} /></Link></div>
      <div className="sidebar-bottom"><p className="sidebar-caption">MAKE YOURSELF AT HOME</p><ThemeToggle />
        {!loading && (user ? <><Link className="sidebar-account" href="/profile" onClick={() => setOpen(false)}><span className="avatar">{user.displayName.charAt(0)}</span><span><strong>{user.displayName}</strong><small>Your profile</small></span></Link><Link className="sidebar-utility" href="/verify" onClick={() => setOpen(false)}><Icon name="check" size={17} />Identity verification</Link><button className="sidebar-utility" onClick={async () => { await logout(); window.location.assign("/"); }}><Icon name="logout" size={17} />Log out</button></> : <div className="sidebar-auth"><Link className="btn-primary" href="/signup" onClick={() => setOpen(false)}>Join Cinevo</Link><Link href="/login" onClick={() => setOpen(false)}>Log in</Link></div>)}
      </div>
    </aside>
    <div className="workspace-topbar"><nav aria-label="Quick browse"><Link href="/discover">Discover</Link><Link href="/trending?sort=newest">New releases</Link><Link href="/trending?filter=short">Short films</Link><Link href="/trending?filter=premieres">Premieres</Link></nav><form action="/trending" role="search"><input aria-label="Search films and creators" name="q" type="search" placeholder="Search films, creators…" /><button type="submit" aria-label="Search"><Icon name="search" size={18} /></button></form></div>
  </>;
}
