import { Geist, Geist_Mono } from "next/font/google";
import OfflineNotice from "@/components/OfflineNotice";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "DrancyBus - Transports Drancy",
  description: "Horaires en temps réel des transports en commun à Drancy - Bus 148, 146, Métro 5, RER B",
  // Installed-app name and iOS home-screen behaviour. The manifest link and
  // the icons come from app/manifest.js, app/icon.svg and app/apple-icon.png.
  applicationName: "DrancyBus",
  appleWebApp: {
    capable: true,
    title: "DrancyBus",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  // Lets the mobile tab bar pad itself clear of the home indicator.
  viewportFit: "cover",
  themeColor: "#0A0086",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegister />
        <OfflineNotice />
        {children}
      </body>
    </html>
  );
}
