export type EventPresentation = {
  artist: string;
  date: string;
  doors: string;
  venue: string;
  location: string;
  format: string;
  artTitle: string;
  artCaption: string;
  theme: "stadium" | "festival" | "night" | "club";
  description: string;
};

// Original fictional event copy. Booking rules and outcomes still come from the API.
export const eventPresentations: Record<string, EventPresentation> = {
  "stadium-opening": {
    artist: "The Daybreaks",
    date: "Saturday, November 14, 2026",
    doors: "7:30 PM",
    venue: "Meridian Park",
    location: "Port Meridian",
    format: "Stadium show · One night only",
    artTitle: "AFTER THE\nLAST LIGHT",
    artCaption: "THE DAYBREAKS · LIVE",
    theme: "stadium",
    description: "A first-night stadium set built for big choruses, bright lights, and a little friendly booking pressure.",
  },
  "summer-festival-drop": {
    artist: "Northstar Weekender",
    date: "Friday–Sunday, August 20–22, 2027",
    doors: "Gates at 2:00 PM",
    venue: "Juniper Fields",
    location: "Redwood Bay",
    format: "Three-day music festival",
    artTitle: "FIND YOUR\nOWN NORTH",
    artCaption: "THREE DAYS · ONE FIELD",
    theme: "festival",
    description: "Three open-air days of discovery across two stages, with a finite simulated drop for general and premium entry.",
  },
  "last-ticket-rush": {
    artist: "Velvet Static",
    date: "Friday, December 18, 2026",
    doors: "8:00 PM",
    venue: "The Nightjar",
    location: "Brooklyn, New York",
    format: "Intimate club show · Limited capacity",
    artTitle: "ONE LAST\nFLASH",
    artCaption: "A VERY SMALL ROOM",
    theme: "night",
    description: "A deliberately tiny room and a single-ticket drop. The virtual buyer schedule can claim the last ticket before your booking arrives.",
  },
  "small-club-drop": {
    artist: "Paper Satellites",
    date: "Saturday, November 7, 2026",
    doors: "8:30 PM",
    venue: "The Glasshouse Room",
    location: "Chicago, Illinois",
    format: "Club show · General admission",
    artTitle: "SOFT NOISE\nAFTER DARK",
    artCaption: "PAPER SATELLITES · LIVE",
    theme: "club",
    description: "A close-up club set with a strict quantity cap. Choose a request size carefully before the simulated inventory resolves.",
  },
};

export function EventArtwork({ slug, presentation, compact = false }: {
  slug: string;
  presentation: EventPresentation;
  compact?: boolean;
}) {
  return (
    <div className={`event-art art-${presentation.theme}${compact ? " event-art-compact" : ""}`} aria-label={`${presentation.artist} event artwork`} role="img">
      <span className="art-orbit art-orbit-one" aria-hidden="true" />
      <span className="art-orbit art-orbit-two" aria-hidden="true" />
      <span className="art-kicker">TICKETSPRINT · FICTIONAL EVENT</span>
      <strong className="art-title">{presentation.artTitle}</strong>
      <span className="art-caption">{presentation.artCaption}</span>
      <span className="art-edition">DROP / {slug.slice(0, 3).toUpperCase()}</span>
    </div>
  );
}
