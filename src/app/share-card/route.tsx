import { ImageResponse } from "next/og";

/** The picture shown when any other page of the site is shared. */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 28,
          padding: "0 96px",
          backgroundColor: "#f3f5fa",
          color: "#14213d",
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#8f6210",
          }}
        >
          Faceless Angels
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 84,
            lineHeight: 1.05,
            fontWeight: 600,
          }}
        >
          <div>Pray together.</div>
          <div>Help quietly.</div>
          <div style={{ color: "#8f6210" }}>Love openly.</div>
        </div>
        <div style={{ fontSize: 30, color: "#55627d" }}>
          A Christian network of prayer groups and quiet giving.
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
