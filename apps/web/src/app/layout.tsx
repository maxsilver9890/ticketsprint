import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "TicketSprint",
  description: "Practice simulated high-demand ticket booking.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
