import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";

export const metadata: Metadata = {
  title: "GCBS — Avaliações GMB",
  description: "Painel de resposta de avaliações Google Meu Negócio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('gcbs-theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav className="navbar">
          <div className="nav-left">
            <a className="nav-logo" href="/">
              <img src="/logo.png" alt="GCBS" />
            </a>
            <span className="gmb-badge">Google Meu Negócio</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ThemeToggle />
          </div>
        </nav>

        {children}

      </body>
    </html>
  );
}
