"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";

interface Review {
  id: string;
  stars: number;
  text: string | null;
  tags: string | null;
  reviewerBadge: string;
  creatorReply: string | null;
  createdAt: string;
  user: { displayName: string; avatarUrl: string | null };
}

const BADGE_STYLE: Record<string, string> = {
  BACKER: "bg-[var(--accent)]/15 text-[var(--accent)]",
  SUBSCRIBER: "bg-blue-500/15 text-blue-400",
  VIEWER: "bg-[var(--surface-raised)] text-[var(--text-dim)]",
};

const TAG_OPTIONS = ["Great acting", "Strong story", "Beautiful visuals", "Well paced", "Loved the ending"];

export function ReviewSection({
  episodeId,
  reviews,
  myReview,
  canReview,
  onSubmitted,
}: {
  episodeId: string;
  reviews: Review[];
  myReview: Review | null;
  canReview: boolean;
  onSubmitted: () => void;
}) {
  const [stars, setStars] = useState(myReview?.stars ?? 5);
  const [text, setText] = useState(myReview?.text ?? "");
  const [tags, setTags] = useState<string[]>(myReview?.tags ? JSON.parse(myReview.tags) : []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/episodes/${episodeId}/reviews`, { stars, text, tags });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 font-serif text-lg font-semibold">Reviews</h2>

      {canReview ? (
        <div className="card mb-6 p-4">
          <div className="mb-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setStars(n)} className="text-xl">
                {n <= stars ? "★" : "☆"}
              </button>
            ))}
          </div>
          <textarea
            className="input"
            rows={2}
            maxLength={300}
            placeholder="What stood out? (optional)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {TAG_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
                className={`badge border ${
                  tags.includes(t)
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-dim)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button className="btn-primary mt-3" onClick={submit} disabled={busy}>
            {myReview ? "Update review" : "Submit review"}
          </button>
        </div>
      ) : (
        !myReview && (
          <p className="mb-6 text-sm text-[var(--text-dim)]">
            Watch at least half the film (or all of it, if under 10 minutes) to leave a verified review.
          </p>
        )
      )}

      <div className="space-y-4">
        {reviews.length === 0 && <p className="text-sm text-[var(--text-dim)]">No reviews yet.</p>}
        {reviews.map((r) => (
          <div key={r.id} className="border-b border-[var(--border)] pb-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.user.displayName}</span>
              <span className={`badge ${BADGE_STYLE[r.reviewerBadge]}`}>{r.reviewerBadge.toLowerCase()}</span>
              <span className="text-xs text-[var(--text-dim)]">{relativeTime(r.createdAt)}</span>
            </div>
            <div className="mt-1 text-sm text-[var(--accent)]">{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</div>
            {r.text && <p className="mt-1 text-sm">{r.text}</p>}
            {r.tags && JSON.parse(r.tags).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {JSON.parse(r.tags).map((t: string) => (
                  <span key={t} className="badge bg-[var(--surface-raised)] text-[var(--text-dim)]">{t}</span>
                ))}
              </div>
            )}
            {r.creatorReply && (
              <div className="mt-2 rounded-lg bg-[var(--surface-raised)] p-2 text-sm">
                <span className="font-medium text-[var(--accent)]">Creator reply: </span>
                {r.creatorReply}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
