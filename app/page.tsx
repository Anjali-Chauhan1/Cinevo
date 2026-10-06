import Link from "next/link";
import { prisma } from "@/lib/db";
import { syncEpisodeStatus } from "@/lib/episodes";
import { EpisodeCard } from "@/components/EpisodeCard";
import { EpisodeStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

async function getHomeData() {
  const rawEpisodes = await prisma.episode.findMany({
    where: { status: { in: ["PUBLIC", "EARLY_ACCESS", "PREMIERING", "SCHEDULED"] } },
    include: { creator: true, popularity: true },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  const episodes = await Promise.all(rawEpisodes.map((e) => syncEpisodeStatus(e).then((s) => ({ ...e, status: s.status }))));

  const live = episodes.filter((e) => e.status === EpisodeStatus.PREMIERING);
  const upcoming = episodes.filter((e) => e.status === EpisodeStatus.SCHEDULED).slice(0, 6);
  const trending = [...episodes]
    .filter((e) => e.popularity)
    .sort((a, b) => (b.popularity?.score ?? 0) - (a.popularity?.score ?? 0))
    .slice(0, 8);
  const freshPublic = episodes
    .filter((e) => e.status === EpisodeStatus.PUBLIC || e.status === EpisodeStatus.EARLY_ACCESS)
    .slice(0, 8);

  const creators = await prisma.creator.findMany({
    where: { verificationStatus: "APPROVED" },
    take: 6,
    orderBy: { createdAt: "desc" },
  });

  return { live, upcoming, trending, freshPublic, creators };
}

export default async function HomePage() {
  const { live, upcoming, trending, freshPublic, creators } = await getHomeData();

  return (
    <div className="space-y-12">
      <section className="card relative overflow-hidden p-8">
        <div className="relative z-10 max-w-2xl">
          <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
            Twitch-style support for indie filmmakers.
          </h1>
          <p className="mt-3 text-[var(--text-dim)]">
            Fans subscribe, tip, and back the next film — creators get paid every second they&apos;re watched.
            All in rupees, no crypto in sight.
          </p>
          <div className="mt-5 flex gap-3">
            <Link href="/trending" className="btn-primary">Explore films</Link>
            <Link href="/become-creator" className="btn-secondary">Start a channel</Link>
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <Section title="Live now" subtitle="Premiering this moment — subscribers and backers only">
          <Grid episodes={live} />
        </Section>
      )}

      {trending.length > 0 && (
        <Section title="Trending" subtitle="Ranked against films of similar size, so student films can trend too">
          <Grid episodes={trending} />
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming premieres">
          <Grid episodes={upcoming} />
        </Section>
      )}

      {freshPublic.length > 0 && (
        <Section title="Watch now">
          <Grid episodes={freshPublic} />
        </Section>
      )}

      {creators.length > 0 && (
        <Section title="Featured creators">
          <div className="flex flex-wrap gap-4">
            {creators.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.handle}`}
                className="card flex w-48 flex-col items-start gap-1 p-4 hover:border-[var(--accent)]/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] font-semibold">
                  {c.channelName.charAt(0)}
                </div>
                <div className="font-medium">{c.channelName}</div>
                <div className="text-xs text-[var(--text-dim)]">@{c.handle}</div>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-serif text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--text-dim)]">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Grid({ episodes }: { episodes: Parameters<typeof EpisodeCard>[0]["episode"][] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {episodes.map((e) => (
        <EpisodeCard key={e.id} episode={e} />
      ))}
    </div>
  );
}
