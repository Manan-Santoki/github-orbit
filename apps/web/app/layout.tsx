import type { Metadata, Viewport } from "next";
import { getConfig } from "@github-orbit/config";
import { Providers } from "../components/providers";
import "./globals.css";

const config = getConfig();

export const metadata: Metadata = {
  title: { default: config.APP_NAME, template: `%s · ${config.APP_NAME}` },
  description: "Explore your GitHub network and discover people worth following.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#080b12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
