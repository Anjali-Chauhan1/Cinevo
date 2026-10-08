"use client";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/components/Icon";

export function ThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "light");
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    function sync() {
      let saved: string | null = null;
      try { saved = localStorage.getItem("cinevo-theme"); } catch { /* Storage can be unavailable in private browsers. */ }
      const next = saved === "light" || saved === "dark" ? saved : system.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    }
    system.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { system.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  function change(next: string) {
    if (next === theme) return;
    try { localStorage.setItem("cinevo-theme", next); } catch { /* Theme still applies for this visit. */ }
    const root = document.documentElement;
    // flushSync so the pressed button is already updated in the "after" snapshot.
    const apply = () => flushSync(() => { root.dataset.theme = next; setTheme(next); });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !document.startViewTransition) { apply(); return; }
    // Scoped class so the diagonal wipe only runs for theme changes.
    root.classList.add("vt-theme");
    document.startViewTransition(apply).finished.finally(() => root.classList.remove("vt-theme"));
  }
  return <div className="theme-switch" role="group" aria-label="Appearance"><button aria-pressed={theme === "light"} onClick={() => change("light")}><Icon name="sun" size={16} />Light</button><button aria-pressed={theme === "dark"} onClick={() => change("dark")}><Icon name="moon" size={16} />Dark</button></div>;
}
