"use client"

import * as React from "react"

type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "nosignal-theme"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default guess is "dark" (the brand default) — corrected from the DOM on
  // mount, since the beforeInteractive script already set the real class
  // before hydration to avoid a flash of the wrong theme.
  const [theme, setTheme] = React.useState<Theme>("dark")

  React.useEffect(() => {
    // One-time correction from the DOM class the beforeInteractive script
    // already set (before this component ever mounted), so React's state
    // matches what's actually on screen instead of the SSR default guess.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light")
  }, [])

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Storage can be unavailable (private mode, blocked) — theme still
      // applies for this session via the class toggle above.
    }
  }, [theme])

  const toggleTheme = React.useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"))
  }, [])

  const value = React.useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}

/** Inline, pre-hydration script text — sets the class synchronously so
 * there's no flash of the wrong theme before React mounts. */
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var dark = stored ? stored === "dark" : true;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
`
