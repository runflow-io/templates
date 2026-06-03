const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = { title: "Example Next.js" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{
        fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        WebkitFontSmoothing: "antialiased",
        background: "#09090B",
        color: "#FAFAFA",
        maxWidth: 600,
        margin: "2rem auto",
        padding: "0 1rem",
      }}>
        <nav style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "2rem",
          borderBottom: "1px solid #27272A",
          paddingBottom: "1rem",
        }}>
          <a href={`${basePath}/`} style={{ color: "#FBBF24", textDecoration: "none", fontFamily: "'Space Mono', monospace", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Home</a>
          <a href={`${basePath}/about`} style={{ color: "#FBBF24", textDecoration: "none", fontFamily: "'Space Mono', monospace", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>About</a>
          <a href={`${basePath}/dashboard`} style={{ color: "#FBBF24", textDecoration: "none", fontFamily: "'Space Mono', monospace", fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Dashboard</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
