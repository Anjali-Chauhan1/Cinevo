import Link from "next/link";
import { paiseWhole } from "@/lib/format";

interface EpisodeCardData {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  status: string;
  isPaid: boolean;
  rateRupeesPaise: number;
  premiereAt: Date | string | null;
  creator: { handle: string; channelName: string };
  popularity?: { level: string; score: number } | null;
}

const STATUS_LABEL: Record<string, string> = {
  PREMIERING: "Live",
  EARLY_ACCESS: "Early access",
  SCHEDULED: "Upcoming",
  PUBLIC: "",
  DRAFT: "Draft",
};

const LEVEL_STYLE: Record<string, string> = {
  RISING: "bg-emerald-500/15 text-emerald-400",
  HOT: "bg-orange-500/15 text-orange-400",
  TRENDING: "bg-[var(--accent)]/15 text-[var(--accent)]",
  FAN_FAVOURITE: "bg-pink-500/15 text-pink-400",
};

export function EpisodeCard({ episode }: { episode: EpisodeCardData }) {
  const statusLabel = STATUS_LABEL[episode.status];
  return (
    <Link href={`/watch/${episode.id}`} className="group block">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-[var(--surface-raised)]">
        {episode.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={episode.thumbnailUrl}
            alt={episode.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--text-dim)]">No preview</div>
        )}
        {statusLabel && (
          <span
            className={`badge absolute left-2 top-2 ${
              episode.status === "PREMIERING" ? "bg-red-500 text-white" : "bg-black/70 text-white"
            }`}
          >
            {episode.status === "PREMIERING" && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
            {statusLabel}
          </span>
        )}
        {episode.popularity && LEVEL_STYLE[episode.popularity.level] && (
          <span className={`badge absolute right-2 top-2 ${LEVEL_STYLE[episode.popularity.level]}`}>
            {episode.popularity.level.replace("_", " ").toLowerCase()}
          </span>
        )}
        {!episode.isPaid ? (
          <span className="badge absolute bottom-2 right-2 bg-black/70 text-emerald-400">Free</span>
        ) : (
          <span className="badge absolute bottom-2 right-2 bg-black/70 text-[var(--accent)]">
            {paiseWhole(episode.rateRupeesPaise)}/min
          </span>
        )}
      </div>
      <div className="mt-2">
        <div className="truncate text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
          {episode.title}
        </div>
        <div className="truncate text-xs text-[var(--text-dim)]">{episode.creator.channelName}</div>
      </div>
    </Link>
  );
}
