import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Taska — El trabajo creativo, en ritmo",
    template: "%s · Taska",
  },
  description:
    "Campañas, entregables, responsables y feedback para agencias creativas.",
  applicationName: "Taska",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    type: "website",
    locale: "es_UY",
    title: "Taska — El trabajo creativo, en ritmo",
    description:
      "Campañas, entregables y feedback en un solo espacio.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Taska" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Taska — El trabajo creativo, en ritmo",
    description:
      "Campañas, entregables y feedback en un solo espacio.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('taska-theme')||'dark';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
