import Link from "next/link";
import { prisma } from "@/lib/db";
import { syncEpisodeStatus } from "@/lib/episodes";
import { EpisodeCard } from "@/components/EpisodeCard";
import { Icon } from "@/components/Icon";
export const dynamic = "force-dynamic";
const filters = [{ id: "all", label: "All films" }, { id: "free", label: "Free to watch" }, { id: "premieres", label: "Premieres" }, { id: "short", label: "Under 20 minutes" }, { id: "early", label: "Early access" }];
export default async function TrendingPage({ searchParams }: { searchParams: { q?: string; filter?: string; sort?: string } }) {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 200) : "";
  const filter = filters.some(f => f.id === searchParams.filter) ? searchParams.filter! : "all";
  const sort = searchParams.sort === "newest" ? "newest" : "trending";
  const raw = await prisma.episode.findMany({ where: { status: { in: ["PUBLIC", "EARLY_ACCESS", "PREMIERING", "SCHEDULED"] }, ...(q ? { OR: [{ title: { contains: q } }, { creator: { channelName: { contains: q } } }] } : {}) }, include: { creator: true, popularity: true }, orderBy: { createdAt: "desc" } });
  const synced = await Promise.all(raw.map(syncEpisodeStatus));
  const episodes = synced.filter(e => filter === "free" ? !e.isPaid && e.status === "PUBLIC" : filter === "premieres" ? ["PREMIERING", "SCHEDULED"].includes(e.status) : filter === "short" ? e.durationSeconds < 1200 : filter === "early" ? e.status === "EARLY_ACCESS" : true);
  if (sort === "trending") episodes.sort((a, b) => (b.popularity?.score ?? 0) - (a.popularity?.score ?? 0));
  function filterHref(id: string) { return `/trending?${new URLSearchParams({ filter: id, ...(q ? { q } : {}), sort })}`; }
  return <div className="explore-page">
    <div className="explore-heading"><span className="eyebrow">FIND SOMETHING THAT STAYS WITH YOU</span><h1>A world of independent stories.</h1><p>Discover a new voice, catch a premiere, or find your next favourite film.</p></div>
    <form action="/trending" className="explore-search" role="search"><Icon name="search" /><input type="search" name="q" defaultValue={q} key={q} placeholder="Search films or filmmakers" aria-label="Search films or filmmakers" /><input type="hidden" name="filter" value={filter} /><label className="sr-only" htmlFor="sort">Sort films</label><select name="sort" id="sort" defaultValue={sort}><option value="trending">Trending first</option><option value="newest">Newest first</option></select><button className="btn-primary" type="submit">Search</button></form>
    <nav className="browse-chips explore-filters" aria-label="Filter films">{filters.map(f => <Link className={`browse-chip ${filter === f.id ? "selected" : ""}`} aria-current={filter === f.id ? "page" : undefined} key={f.id} href={filterHref(f.id)}>{f.label}</Link>)}</nav>
    <div className="results-heading"><h2>{q ? `Results for “${q}”` : filters.find(f => f.id === filter)?.label}<span>{episodes.length} {episodes.length === 1 ? "film" : "films"}</span></h2><p>{sort === "trending" ? "Ranked by community support, watch time and verified reviews." : "The latest stories from our filmmakers."}</p></div>
    {episodes.length ? <div className="film-grid">{episodes.map(e => <EpisodeCard episode={e} key={e.id} />)}</div> : <div className="empty-state"><Icon name="search" size={36} /><h2>{q ? "No stories found. Yet." : "More stories are on the way."}</h2><p>{q ? "Try another title or filmmaker, or explore the full collection." : "Explore other films while you wait for something new."}</p><Link href="/trending" className="btn-secondary">Explore all films<Icon name="arrow" size={16} /></Link></div>}
  </div>;
}
