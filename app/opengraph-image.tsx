import { ImageResponse } from "next/og"

export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#08080B",
          position: "relative",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2 L22 8.5 L12 22 L2 8.5 Z"
            fill="#EDE8DF"
            fillOpacity="0.92"
          />
          <path d="M12 2 L22 8.5 L12 13 Z" fill="#C9A961" />
        </svg>
        <div
          style={{
            marginTop: 40,
            fontSize: 96,
            color: "#EDE8DF",
            letterSpacing: -2,
          }}
        >
          nosignal
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 26,
            color: "#EDE8DF",
            opacity: 0.6,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Frida + Python · Reverse engineering
        </div>
      </div>
    ),
    { ...size }
  )
}
