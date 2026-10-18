"use client";

type Category = { id: string; label: string; priceCents: number; inventory: number; maxQuantity: number; seatIds?: string[] };

export function VenueSeatMap({ category, quantity, selected, onChange }: {
  category: Category;
  quantity: number;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const seats = category.seatIds ?? [];
  const rows = Array.from({ length: Math.ceil(seats.length / 4) }, (_, row) => seats.slice(row * 4, row * 4 + 4));
  function toggle(seat: string) {
    onChange(selected.includes(seat) ? selected.filter((item) => item !== seat) : [...selected, seat]);
  }
  function chooseFirstSeats() {
    onChange(seats.slice(0, quantity));
  }

  return (
    <section className="venue-map-panel" aria-labelledby="seat-map-title">
      <div className="venue-map-heading"><div><p className="eyebrow">INTERACTIVE SEAT MAP</p><h3 id="seat-map-title">{category.label}</h3></div><span>{selected.length} of {quantity} selected</span></div>
      <div className="venue-map" role="group" aria-label={`${category.label} seating map`}>
        <div className="venue-map-crown" aria-hidden="true"><span>UPPER BOWL</span><span>UPPER BOWL</span></div>
        <div className="venue-map-stage"><span aria-hidden="true">✦</span><strong>STAGE</strong><small>ARTIST VIEW</small></div>
        <div className="seat-rows">
          {rows.map((row, rowIndex) => <div className="seat-row" key={`row-${rowIndex}`}><span className="seat-row-label">{String.fromCharCode(65 + rowIndex)}</span>{row.map((seat) => {
            const isSelected = selected.includes(seat);
            return <button type="button" className={`seat-dot${isSelected ? " seat-dot-selected" : ""}`} key={seat} aria-label={`Seat ${seat}, ${isSelected ? "selected" : "available"}`} aria-pressed={isSelected} onClick={() => toggle(seat)}>{seat.slice(-2)}</button>;
          })}<span className="seat-row-label">{String.fromCharCode(65 + rowIndex)}</span></div>)}
        </div>
        <div className="venue-map-legend"><span><i className="legend-seat" /> Available</span><span><i className="legend-seat legend-seat-picked" /> Selected</span><span className="muted">No seats are reserved until the server confirms your practice result.</span></div>
      </div>
      <div className="seat-map-actions"><p>Auto-pick selects the first configured seats in this section. You can change them before continuing.</p><button type="button" className="button button-secondary button-compact" onClick={chooseFirstSeats}>Use best available</button></div>
    </section>
  );
}

export function PracticeOrderSummary({ title, category, quantity, seats, deadline, waitingRoom, competitive }: {
  title: string;
  category?: Category | undefined;
  quantity: number;
  seats: string[];
  deadline: string;
  waitingRoom: boolean;
  competitive: boolean;
}) {
  const subtotal = (category?.priceCents ?? 0) * quantity;
  return (
    <aside className="booking-aside">
      <section className="order-card" aria-labelledby="order-title">
        <div className="order-card-top"><p className="eyebrow">PRACTICE ORDER</p><span className="order-live"><i aria-hidden="true" /> LIVE SESSION</span></div>
        <h2 id="order-title">Your selection</h2>
        <p className="order-event-title">{title}</p>
        <div className="order-rule" />
        {category ? <>
          <div className="order-line"><span>Ticket type</span><strong>{category.label}</strong></div>
          <div className="order-line"><span>Quantity</span><strong>{quantity} {quantity === 1 ? "ticket" : "tickets"}</strong></div>
          {seats.length > 0 && <div className="order-seats"><span>Seats</span><strong>{seats.join(" · ")}</strong></div>}
          <div className="order-total"><span>Simulated total</span><strong>{(subtotal / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong></div>
          <p className="order-price-note">Practice display only · no payment is collected</p>
        </> : <p className="order-empty">Choose a ticket type to build your practice order.</p>}
        <div className="order-deadline"><span>BOOKING WINDOW</span><strong>{deadline}</strong></div>
        <div className="order-status"><span className="order-status-dot" /><p><strong>{waitingRoom ? "Waiting room" : competitive ? "Competitive drop" : "Practice sale open"}</strong><small>{waitingRoom ? "Sale opens on the session countdown. No queue position or wait estimate is available." : competitive ? "Buyer activity is simulated and resolved by the server." : "Your booking steps are timed by the server."}</small></p></div>
      </section>
      <p className="order-footnote">Fictional event. Virtual tickets only. This practice session cannot purchase or reserve real tickets.</p>
    </aside>
  );
}
