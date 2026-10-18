import Link from "next/link";
export function HomeHeroActions() {
  return (
    <div className="hero-actions">
      <Link className="button button-primary" href="/arena">
        Explore practice drops <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
