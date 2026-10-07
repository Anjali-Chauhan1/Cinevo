import Link from "next/link";
import { prisma } from "@/lib/db";
import { syncEpisodeStatus } from "@/lib/episodes";
import { getCurrentUser } from "@/lib/auth";
import { EpisodeCard } from "@/components/EpisodeCard";
import { Icon } from "@/components/Icon";
import { paise } from "@/lib/format";

export async function DiscoverHome() {
  const user = await getCurrentUser();
  const [raw, creators, history, campaign] = await Promise.all([
    prisma.episode.findMany({ where: { status: { in: ["PUBLIC", "EARLY_ACCESS", "PREMIERING", "SCHEDULED"] } }, include: { creator: true, popularity: true }, orderBy: { createdAt: "desc" }, take: 24 }),
    prisma.creator.findMany({ where: { verificationStatus: "APPROVED" }, take: 4, orderBy: { createdAt: "desc" } }),
    user ? prisma.episodeAccess.findMany({ where: { viewerId: user.id, secondsWatched: { gt: 0 }, episode: { status: { in: ["PUBLIC", "EARLY_ACCESS", "PREMIERING"] } } }, include: { episode: { include: { creator: true } } }, orderBy: { updatedAt: "desc" }, take: 3 }) : Promise.resolve([]),
    prisma.campaign.findFirst({ where: { status: "ACTIVE", deadline: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  const episodes = await Promise.all(raw.map(syncEpisodeStatus));
  const available = episodes.filter(e => e.status !== "SCHEDULED");
  const trending = [...available].sort((a,b) => (b.popularity?.score ?? 0) - (a.popularity?.score ?? 0)).slice(0, 6);
  const upcoming = episodes.filter(e => e.status === "SCHEDULED");
  const featured = available.find(e => e.status === "PUBLIC" && !e.isPaid) ?? available[0] ?? upcoming[0];
  return <div className="cinema-workspace">
    <div className="cinema-center">
      <section className="feature-banner" aria-label="Featured film">
        {featured?.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={featured.thumbnailUrl} alt="" fetchPriority="high" />
        )}
        <div className="feature-overlay" />
        <div className="feature-tags"><span>Independent cinema</span><span>{featured ? `${Math.ceil(featured.durationSeconds / 60)} min` : "Made for film lovers"}</span></div>
        <div className="feature-copy"><p className="feature-eyebrow">THIS WEEK’S SPOTLIGHT</p><h1>{featured?.title ?? "Your next favourite story."}</h1><p>{featured?.description ?? "Discover bold voices and beautiful stories from independent filmmakers."}</p><div className="feature-actions"><Link className="btn-primary" href={featured ? `${featured.status === "PREMIERING" ? "/premiere" : "/watch"}/${featured.id}` : "/trending"}><Icon name="play" size={14} />{featured?.status === "PREMIERING" ? "Join premiere" : featured?.status === "SCHEDULED" ? "View premiere" : "Watch now"}</Link>{featured && <Link className="feature-creator" href={`/c/${featured.creator.handle}`}>By {featured.creator.channelName}<Icon name="arrow" size={14} /></Link>}</div></div>
      </section>
      <section className="poster-section"><div className="poster-heading"><h2>Trending now <span className="heading-spark">✦</span></h2><Link href="/trending">View all <Icon name="arrow" size={14} /></Link></div>{trending.length ? <div className="poster-grid">{trending.map(e => <EpisodeCard key={e.id} episode={e} />)}</div> : <div className="empty-state"><Icon name="film" size={30} /><p>New stories are on their way. Start a channel to share yours.</p><Link className="btn-secondary" href="/become-creator">Become a filmmaker</Link></div>}</section>
      <section className="poster-section"><div className="poster-heading"><h2>Coming soon</h2><Link href="/trending?filter=premieres">Premieres <Icon name="arrow" size={14} /></Link></div>{upcoming.length ? <div className="poster-grid">{upcoming.slice(0, 3).map(e => <EpisodeCard key={e.id} episode={e} />)}</div> : <div className="premiere-empty"><Icon name="live" size={24} /><div><h3>The next premiere is in the making.</h3><p>Explore something new while you wait.</p></div><Link href="/trending"><Icon name="arrow" size={20} /><span className="sr-only">Explore films</span></Link></div>}</section>
      {campaign && <section className="project-callout"><div><span className="eyebrow">BE PART OF THE NEXT CHAPTER</span><h2>{campaign.filmTitle}</h2><p>{campaign.pitch ?? "Help an independent story find its way to the screen."}</p><div className="campaign-progress" role="progressbar" aria-label="Campaign funding" aria-valuenow={Math.min(100,Math.round(campaign.totalBackedPaise / Math.max(1,campaign.goalPaise)*100))} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${Math.min(100,campaign.totalBackedPaise / Math.max(1,campaign.goalPaise)*100)}%`}} /></div><small>{paise(campaign.totalBackedPaise)} raised of {paise(campaign.goalPaise)}</small></div><Link className="btn-primary" href={`/back/${campaign.id}`}>Explore project<Icon name="arrow" size={15} /></Link></section>}
    </div>
    <aside className="activity-rail" aria-label="Your cinema activity">
      <section><div className="rail-heading"><h2>{history.length ? "Recently watched" : "Up next for you"}</h2><Icon name="play" size={16} /></div>
        <div className="rail-films">{(history.length ? history.map(h => h.episode) : available.slice(0, 3)).map(e => <Link href={`${e.status === "PREMIERING" ? "/premiere" : "/watch"}/${e.id}`} className="rail-film" key={e.id}><div className="rail-thumb">{e.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.thumbnailUrl} alt="" />
        )}<span><Icon name="play" size={14} /></span></div><div><h3>{e.title}</h3><p>{e.creator.channelName}</p><small>{Math.ceil(e.durationSeconds / 60)} min · {e.status === "PREMIERING" ? "Live premiere" : e.isPaid ? `${paise(e.rateRupeesPaise)}/min` : "Free to watch"}</small></div></Link>)}</div>
        {!available.length && !history.length && <p className="rail-empty">Your next watch will appear here when films are published.</p>}
      </section>
      <section><div className="rail-heading"><h2>In the creator community</h2></div><div className="rail-creators">{creators.map((c,i) => <Link href={`/c/${c.handle}`} className={`rail-creator creator-tone-${i % 3}`} key={c.id}><span className="creator-avatar">{c.channelName.charAt(0)}</span><div><h3>{c.channelName}<Icon name="check" size={12} /></h3><p>{c.bio ?? "Independent filmmaker"}</p></div></Link>)}</div>{!creators.length && <p className="rail-empty">Meet new filmmakers as the community grows.</p>}</section>
      <section className="rail-invite"><span className="rail-invite-icon"><Icon name="live" size={26} /></span><h3>Better when<br />watched together.</h3><p>Share the first screening. Meet the people behind the story.</p><Link href="/trending?filter=premieres">Find a premiere <Icon name="arrow" size={15} /></Link></section>
      <p className="rail-footnote">Independent stories.<br />A little closer to you.</p>
    </aside>
  </div>;
}
