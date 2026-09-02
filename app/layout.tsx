import type { Metadata } from "next";
import { headers } from "next/headers";
import { Archivo } from "next/font/google";
import "./globals.css";
import "./works.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata():Promise<Metadata>{
  const h=await headers();const host=h.get("x-forwarded-host")||h.get("host")||"localhost:3001";const protocol=h.get("x-forwarded-proto")||(host.startsWith("localhost")?"http":"https");const image=`${protocol}://${host}/og.png`;const title="MakeLogic — EcoForm orders, production and money";const description="Take orders, check stock, run the floor, and invoice through QuickBooks — simple enough for anyone on the team.";
  return {title,description,icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"},openGraph:{title,description,images:[image]},twitter:{card:"summary_large_image",title,description,images:[image]}};
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
