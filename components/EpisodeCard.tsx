import Link from "next/link";
import { durationLabel, paise } from "@/lib/format";
import { Icon } from "@/components/Icon";
export interface EpisodeCardData {
  id: string; title: string; thumbnailUrl: string | null; status: string;
  isPaid: boolean; rateRupeesPaise: number; premiereAt: Date | string | null;
  durationSeconds?: number;
  creator: { handle: string; channelName: string; verificationStatus?: string };
  popularity?: { level: string; score: number } | null;
}
export function EpisodeCard({ episode }: { episode: EpisodeCardData }) {
  const statusLabel = ({ PREMIERING: "Live premiere", EARLY_ACCESS: "Early access", SCHEDULED: "Coming soon", DRAFT: "Draft" } as Record<string, string>)[episode.status];
  const href = episode.status === "PREMIERING" ? `/premiere/${episode.id}` : `/watch/${episode.id}`;
  return <article className="film-card">
    <Link href={href} className="film-art" aria-label={`${episode.title}${statusLabel ? `, ${statusLabel}` : ""}`}>
      {episode.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={episode.thumbnailUrl} alt="" loading="lazy" className="film-image" />
      ) : <div className="film-placeholder"><Icon name="film" size={40} /><span>{episode.title}</span></div>}
      <div className="film-shade" />
      {statusLabel && <span className={`film-status ${episode.status === "PREMIERING" ? "is-live" : ""}`}>{episode.status === "PREMIERING" && <span className="live-dot" />}{statusLabel}</span>}
      <span className="film-play"><Icon name="play" size={22} /></span>
      {episode.durationSeconds != null && <span className="film-duration">{durationLabel(episode.durationSeconds)}</span>}
    </Link>
    <div className="film-details">
      <Link href={`/c/${episode.creator.handle}`} className="film-avatar" aria-label={`${episode.creator.channelName} channel`}>{episode.creator.channelName.charAt(0)}</Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="film-title">{episode.title}</Link>
        <Link href={`/c/${episode.creator.handle}`} className="film-creator">{episode.creator.channelName} {episode.creator.verificationStatus === "APPROVED" && <Icon name="check" size={12} />}</Link>
        <div className="film-meta"><span className={!episode.isPaid ? "free-label" : ""}>{episode.isPaid ? `${paise(episode.rateRupeesPaise)}/min` : "Free to watch"}</span>{episode.popularity && episode.popularity.level !== "NONE" && <><span>·</span><span>{episode.popularity.level.replaceAll("_", " ").toLowerCase()}</span></>}</div>
        {episode.status === "SCHEDULED" && episode.premiereAt && <p className="film-date">{new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(episode.premiereAt))} IST</p>}
      </div>
    </div>
  </article>;
}
