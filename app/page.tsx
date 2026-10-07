import Link from "next/link";
import { prisma } from "@/lib/db";
import { syncEpisodeStatus } from "@/lib/episodes";
import { EpisodeCard, type EpisodeCardData } from "@/components/EpisodeCard";
import { Icon } from "@/components/Icon";
import { paise } from "@/lib/format";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [raw, creators, campaigns] = await Promise.all([
    prisma.episode.findMany({ where: { status: { in: ["PUBLIC", "EARLY_ACCESS", "PREMIERING", "SCHEDULED"] } }, include: { creator: true, popularity: true }, orderBy: { createdAt: "desc" }, take: 24 }),
    prisma.creator.findMany({ where: { verificationStatus: "APPROVED" }, take: 4, orderBy: { createdAt: "desc" } }),
    prisma.campaign.findMany({ where: { status: "ACTIVE", deadline: { gt: new Date() } }, include: { creator: true }, take: 1, orderBy: { createdAt: "desc" } }),
  ]);
  const episodes = await Promise.all(raw.map(syncEpisodeStatus));
  const live = episodes.filter(e => e.status === "PREMIERING");
  const upcoming = episodes.filter(e => e.status === "SCHEDULED");
  const publicFilms = episodes.filter(e => e.status === "PUBLIC" || e.status === "EARLY_ACCESS");
  const featured = publicFilms.find(e => !e.isPaid) ?? publicFilms[0] ?? live[0] ?? upcoming[0];
  const campaign = campaigns[0];
  return <div className="discovery">
    <div className="discovery-intro"><span className="eyebrow">THE HOME OF INDEPENDENT FILM</span><span>Big stories. Independent voices.</span></div>
    <section className="cinema-hero" aria-label="Featured film">
      {featured?.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hero-art" src={featured.thumbnailUrl} alt="" fetchPriority="high" />
      )}
      <div className="hero-vignette" />
      <div className="hero-content">
        <span className="hero-kicker"><span className="small-star">✦</span> {featured ? "IN THE SPOTLIGHT" : "WELCOME TO CINEVO"}</span>
        <h1>{featured?.title ?? "Discover your next favourite story."}</h1>
        {featured && <div className="hero-metadata"><span>A film by {featured.creator.channelName}</span><span>·</span><span>{Math.ceil(featured.durationSeconds / 60)} min</span><span className="hero-price">{featured.status === "SCHEDULED" ? "Coming soon" : featured.status === "PREMIERING" ? "Live premiere" : featured.status === "EARLY_ACCESS" ? "Early access" : featured.isPaid ? `${paise(featured.rateRupeesPaise)}/min` : "Free to watch"}</span></div>}
        <p>{featured?.description ?? "Meet the filmmakers doing things differently. Discover original films, share a premiere, and help the next story come to life."}</p>
        <div className="hero-buttons"><Link className="btn-primary" href={featured ? (featured.status === "PREMIERING" ? `/premiere/${featured.id}` : `/watch/${featured.id}`) : "/trending"}><Icon name="play" size={17} />{featured?.status === "SCHEDULED" ? "View premiere" : featured?.status === "PREMIERING" ? "Join premiere" : "Watch film"}</Link><Link className="hero-secondary" href={featured ? `/c/${featured.creator.handle}` : "/become-creator"}>{featured ? "Meet the filmmaker" : "Start your channel"}<Icon name="arrow" size={17} /></Link></div>
        <span className="hero-footnote">Every watch is a little love for independent cinema.</span>
      </div>
      <div className="hero-stamp"><Icon name="film" size={24} /><span>INDEPENDENT FILM<br /><strong>Extraordinary perspectives.</strong></span></div>
    </section>

    <div className="discovery-bar"><nav className="browse-chips" aria-label="Browse films"><Link className="browse-chip selected" href="/trending"><Icon name="film" size={16} />All films</Link><Link className="browse-chip" href="/trending?filter=free">Free to watch</Link><Link className="browse-chip" href="/trending?filter=premieres"><Icon name="live" size={16} />Premieres</Link><Link className="browse-chip" href="/trending?filter=short">Under 20 minutes</Link><Link className="browse-chip" href="/trending?filter=early">Early access</Link></nav><span className="discovery-note">A new perspective awaits</span></div>

    {live.length > 0 && <Section title="The premiere is on." subtitle="Watch together. Meet the filmmaker. Be part of the moment." label="LIVE NOW" href="/trending?filter=premieres"><Grid episodes={live.slice(0, 4)} /></Section>}
    <Section title="Find your next favourite." subtitle="Original voices. Unforgettable stories. All in one place." label="MADE TO BE DISCOVERED" href="/trending">
      {publicFilms.length > 0 ? <Grid episodes={publicFilms.slice(0, 4)} /> : <div className="empty-state"><Icon name="film" size={32} /><h3>The next great story is on its way.</h3><p>Explore premieres or start a channel to share your own film.</p><Link href="/become-creator" className="btn-secondary">Start a channel<Icon name="arrow" size={16} /></Link></div>}
    </Section>
    {campaign && <section className="backing-banner"><div className="backing-art"><Icon name="film" size={56} /><span>THE NEXT<br />CHAPTER.</span></div><div className="backing-copy"><span className="eyebrow">DON’T JUST WATCH. MAKE IT HAPPEN.</span><h2>Be part of {campaign.filmTitle}.</h2><p>{campaign.pitch ?? "Help an independent filmmaker bring their next story to the screen."}</p><div className="campaign-progress" role="progressbar" aria-label="Campaign funding" aria-valuenow={Math.min(100, Math.round(campaign.totalBackedPaise / campaign.goalPaise * 100))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, campaign.totalBackedPaise / campaign.goalPaise * 100)}%` }} /></div><span className="funding-caption">{paise(campaign.totalBackedPaise)} raised of {paise(campaign.goalPaise)} goal</span></div><Link className="btn-primary" href={`/back/${campaign.id}`}>Explore the project<Icon name="arrow" size={17} /></Link></section>}
    {upcoming.length > 0 && <Section title="Save a seat for something special." subtitle="Discover upcoming premieres from independent filmmakers." label="COMING TO YOUR SCREEN" href="/trending?filter=premieres"><Grid episodes={upcoming.slice(0, 4)} /></Section>}
    {creators.length > 0 && <Section title="Meet the people behind the stories." subtitle="Find a filmmaker. Follow their journey. Help their next idea take flight." label="INDEPENDENT VOICES"><div className="creator-grid">{creators.map((c, index) => <Link className={`creator-card creator-tone-${index % 3}`} href={`/c/${c.handle}`} key={c.id}><div className="creator-avatar">{c.channelName.charAt(0)}<span><Icon name="check" size={11} /></span></div><div><h3>{c.channelName}</h3><span>@{c.handle}</span><p>{c.bio ?? "Independent filmmaker on Cinevo."}</p></div><Icon name="arrow" size={18} /></Link>)}</div></Section>}
    <section className="creator-invite"><div><span className="eyebrow">YOUR CAMERA. YOUR VOICE. YOUR COMMUNITY.</span><h2>Good stories deserve to be seen.</h2><p>Build your audience, share your films, and fund what comes next.</p></div><Link href="/become-creator" className="btn-secondary">Start your channel<Icon name="arrow" size={18} /></Link></section>
  </div>;
}
function Section({ title, subtitle, label, href, children }: { title: string; subtitle: string; label: string; href?: string; children: React.ReactNode }) {
  return <section className="discovery-section"><div className="section-heading"><div><span className="eyebrow">{label}</span><h2>{title}</h2><p>{subtitle}</p></div>{href && <Link className="text-link" href={href}>View all<Icon name="arrow" size={16} /></Link>}</div>{children}</section>;
}
function Grid({ episodes }: { episodes: EpisodeCardData[] }) { return <div className="film-grid">{episodes.map(e => <EpisodeCard key={e.id} episode={e} />)}</div>; }
