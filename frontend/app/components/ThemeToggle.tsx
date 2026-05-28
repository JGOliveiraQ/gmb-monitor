"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("gcbs-theme") as "dark" | "light" | null;
    setTheme(saved || "dark");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    const html = document.documentElement;

    const wipe = document.createElement("div");
    wipe.className = "theme-wipe";
    wipe.style.background =
      next === "light"
        ? "linear-gradient(to bottom, #ffffff, #eef0f6)"
        : "linear-gradient(to bottom, #0a0a0a, #111111)";
    document.body.appendChild(wipe);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        wipe.classList.add("wipe-in");
        setTimeout(() => {
          html.setAttribute("data-theme", next);
          localStorage.setItem("gcbs-theme", next);
          setTheme(next);
        }, 220);
        setTimeout(() => {
          wipe.classList.remove("wipe-in");
          wipe.classList.add("wipe-out");
          setTimeout(() => wipe.remove(), 400);
        }, 380);
      })
    );
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Alternar tema">
      {theme === "light" ? (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}
