import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventDetailClient } from "@/features/booking/EventDetailClient";
import { eventPresentations } from "@/features/booking/events";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = eventPresentations[slug];
  return event ? { title: `${event.artist} — Practice event`, description: event.description } : { title: "Event not found" };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!eventPresentations[slug]) notFound();
  return <EventDetailClient slug={slug} />;
}
