import { useEffect, useState, useCallback } from "react";
import { ThemeContext } from "./ThemeContext.jsx";

function storageKey(userId) {
  return userId ? `tam-theme:${userId}` : null;
}

function getInitialTheme(userId) {
  try {
    const key = storageKey(userId);

    if (key) {
      const stored = localStorage.getItem(key);

      if (stored === "dark" || stored === "light") {
        return stored;
      }
    }
  } catch {}

  return "light";
}

export default function ThemeProvider({ userId, children }) {
  const [theme, setTheme] = useState(() => getInitialTheme(userId));

  // Reload theme when user changes
  useEffect(() => {
    setTheme(getInitialTheme(userId));
  }, [userId]);

  // Apply dark class + persist
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");

    try {
      const key = storageKey(userId);

      if (key) {
        localStorage.setItem(key, theme);
      }
    } catch {}
  }, [theme, userId]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
