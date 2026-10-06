import { prisma } from "@/lib/db";
import { EpisodeCard } from "@/components/EpisodeCard";

export const dynamic = "force-dynamic";

export default async function TrendingPage() {
  const scores = await prisma.popularityScore.findMany({
    orderBy: { score: "desc" },
    take: 40,
    include: { episode: { include: { creator: true } } },
  });

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold">Trending</h1>
      <p className="mt-1 text-sm text-[var(--text-dim)]">
        Ranked against films of similar size and age — unique supporters, watch time and verified
        ratings, not raw view counts.
      </p>

      {scores.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--text-dim)]">
          No popularity data yet — scores update as films get watched, reviewed and tipped.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {scores.map((s) => (
            <EpisodeCard key={s.episodeId} episode={{ ...s.episode, popularity: s }} />
          ))}
        </div>
      )}
    </div>
  );
}
