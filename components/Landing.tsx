import Link from "next/link";
import { Icon } from "@/components/Icon";

const FAN_STEPS = [
  { title: "Watch", text: "Free episodes first. Paid ones cost a few rupees a minute, with a cap — you never pay more than the price on the tin." },
  { title: "Support", text: "Subscribe to a filmmaker, tip during a premiere, and get your name on their supporter wall." },
  { title: "Back the next film", text: "Your money waits in escrow and is released milestone by milestone. If the film never arrives, you get it back." },
];

const CREATOR_POINTS = [
  { icon: "wallet", title: "Paid from day one", text: "Tips, subscriptions and pay-per-minute — no partner thresholds to hit first." },
  { icon: "live", title: "Premieres with your fans", text: "Live chat, reactions and a hype bar that unlocks bonus content as your audience cheers." },
  { icon: "film", title: "Fund what comes next", text: "Run a campaign with perk tiers. Backers get credits, early access and a say in the film." },
  { icon: "trending", title: "Discovery that's fair", text: "Films are ranked against others of similar size, so a student short can trend too." },
] as const;

export function Landing() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <span className="eyebrow">THE HOME OF INDEPENDENT FILM</span>
        <h1>Fans fund the films they want to see.</h1>
        <p>
          Filmmakers run their own channels. You subscribe, tip and back their next film — and they get paid
          for every second you watch.
        </p>
        <div className="landing-actions">
          <Link href="/signup" className="btn-primary">
            Sign up free <Icon name="arrow" size={16} />
          </Link>
          <Link href="/login" className="btn-secondary">
            Sign in
          </Link>
          <Link href="/discover" className="btn-secondary">Explore films <Icon name="arrow" size={16} /></Link>
        </div>
        <span className="landing-footnote">Sign in with email · prices in ₹ · no wallets or popups</span>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FOR FANS</span>
            <h2>Pay only for what you watch.</h2>
          </div>
        </div>
        <ol className="landing-steps">
          {FAN_STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="landing-step-number">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FOR FILMMAKERS</span>
            <h2>Your camera. Your audience. Your income.</h2>
          </div>
        </div>
        <div className="landing-grid">
          {CREATOR_POINTS.map((point) => (
            <div key={point.title} className="landing-card">
              <Icon name={point.icon} size={22} />
              <h3>{point.title}</h3>
              <p>{point.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="creator-invite">
        <div>
          <span className="eyebrow">READY WHEN YOU ARE</span>
          <h2>Good stories deserve to be seen.</h2>
          <p>Create an account to start watching, or set up a channel and share your film.</p>
        </div>
        <div className="landing-actions">
          <Link href="/signup" className="btn-primary">
            Create an account <Icon name="arrow" size={16} />
          </Link>
          <Link href="/login" className="btn-secondary">
            I already have one
          </Link>
        </div>
      </section>
    </div>
  );
}
