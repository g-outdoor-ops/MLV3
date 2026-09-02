import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./extras.css";
import "./list-fixes.css";
import "./search.css";
import "./financials.css";
import "./owner-navigation.css";
import "./control-center.css";
import "./notifications.css";
import "./month-calendar.css";
import "./calendar-legend-fix.css";
import "./operations-workspaces.css";
import "./accounts-roles.css";
import "./warehouse-link.css";
import "./clickthroughs.css";
import "./crm.css";
import "./customer-tabs.css";
import "./connected-workflows.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata():Promise<Metadata>{
  const h=await headers();const host=h.get("x-forwarded-host")||h.get("host")||"localhost:3001";const protocol=h.get("x-forwarded-proto")||(host.startsWith("localhost")?"http":"https");const image=`${protocol}://${host}/og.png`;const title="MakeLogic — Manufacturing control from sale to shipment";const description="A simple company control center for customers, quotes, orders, production, warehouse work, inventory, and financial reporting.";
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
