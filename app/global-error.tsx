"use client"

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          background: "#08080b",
          color: "#ede8df",
          fontFamily: "Arial, Helvetica, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <p style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "#9aa3b8" }}>
          Critical error
        </p>
        <h1 style={{ fontSize: 32, margin: 0 }}>nosignal is temporarily down</h1>
        <p style={{ maxWidth: 380, color: "#9aa3b8", fontSize: 14, lineHeight: 1.6 }}>
          Something broke at the application level. Try reloading — if it
          keeps happening, check back shortly.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: "0.5rem",
            padding: "0.6rem 1.5rem",
            borderRadius: 999,
            border: "1px solid #c9a961",
            background: "transparent",
            color: "#c9a961",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  )
}
