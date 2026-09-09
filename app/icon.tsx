import { ImageResponse } from "next/og"

export const size = {
  width: 32,
  height: 32,
}
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08080B",
          borderRadius: 6,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2 L22 8.5 L12 22 L2 8.5 Z"
            fill="#EDE8DF"
            fillOpacity="0.92"
          />
          <path d="M12 2 L22 8.5 L12 13 Z" fill="#C9A961" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
