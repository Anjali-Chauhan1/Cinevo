"use client";
import { useEffect, useState } from "react";
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
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("cinevo-theme", next); } catch { /* Theme still applies for this visit. */ }
  }
  return <div className="theme-switch" role="group" aria-label="Appearance"><button aria-pressed={theme === "light"} onClick={() => change("light")}><Icon name="sun" size={16} />Light</button><button aria-pressed={theme === "dark"} onClick={() => change("dark")}><Icon name="moon" size={16} />Dark</button></div>;
}
