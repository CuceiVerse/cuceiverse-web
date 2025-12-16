export default function App() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b0f19",
        color: "white",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
        padding: "24px",
      }}
    >
      <section style={{ textAlign: "center", maxWidth: 720 }}>
        <h1 style={{ margin: 0, fontSize: 40, letterSpacing: -0.5 }}>
          CUCEIverse
        </h1>
        <p style={{ marginTop: 12, fontSize: 16, opacity: 0.85, lineHeight: 1.6 }}>
          En construcción. MVP de infraestructura: Web, API, Microservicio IA y Base de Datos.
        </p>

        <div
          style={{
            marginTop: 24,
            display: "inline-flex",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            fontSize: 14,
            opacity: 0.9,
          }}
        >
          <span>Web: OK</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>API: /health</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>Avatar: /health</span>
        </div>
      </section>
    </main>
  );
}
