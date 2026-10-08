"use client";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/components/Icon";

let audio: AudioContext | null = null;

/** Synthesised shutter click: two crisp filtered-noise ticks (panned slightly
 * left then right) over a short low thump. No audio file to load. */
function playSwitchSound() {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    const noise = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const tick = (at: number, highpass: number, band: number, q: number, peak: number, decay: number, pan: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = highpass;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = band;
      bp.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(hp).connect(bp).connect(gain).connect(panner).connect(ctx.destination);
      src.start(at);
      src.stop(at + decay + 0.005);
    };
    tick(now, 5000, 7500, 3.5, 0.25, 0.008, -0.08);
    tick(now + 0.045, 6000, 6000, 3, 0.18, 0.009, 0.08);

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.frequency.setValueAtTime(300, now);
    thump.frequency.exponentialRampToValueAtTime(90, now + 0.045);
    thumpGain.gain.setValueAtTime(0.035, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.05);
  } catch { /* Sound is decoration; the theme still changes without it. */ }
}

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
    playSwitchSound();
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
