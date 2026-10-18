import { BookingClient } from "@/features/booking/BookingClient";

export default async function BookingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <BookingClient sessionId={sessionId} />;
}
