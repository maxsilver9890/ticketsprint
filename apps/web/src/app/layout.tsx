import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SessionBestProvider } from "@/features/booking/SessionBest";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "TicketSprint — Live drop practice",
    template: "%s | TicketSprint",
  },
  description:
    "Rehearse high-demand ticket booking in a realistic, server-timed simulation.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionBestProvider>
          <SiteNav />
          {children}
        </SessionBestProvider>
      </body>
    </html>
  );
}
