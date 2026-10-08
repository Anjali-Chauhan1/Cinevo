"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { WatchPlayer } from "@/components/WatchPlayer";
import { PremiereRoom } from "@/components/PremiereRoom";

interface EpisodeData {
  episode: {
    id: string;
    title: string;
    description: string | null;
    videoKey: string;
    status: string;
    creatorId: string;
    creator: { handle: string; channelName: string; userId: string };
  };
  viewerState: { signedIn: boolean; isModerator?: boolean };
}

export default function PremierePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user } = useAuth();
  const [data, setData] = useState<EpisodeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EpisodeData>(`/api/episodes/${id}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load premiere"));
  }, [id]);

  if (error) return <p className="py-12 text-center text-[var(--text-dim)]">{error}</p>;
  if (!data) return <p className="py-12 text-center text-[var(--text-dim)]">Loading...</p>;

  const { episode, viewerState } = data;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="badge bg-red-500 text-white">
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live premiere
        </span>
        <h1 className="font-serif text-xl font-bold">{episode.title}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {episode.status === "PREMIERING" ? (
            <WatchPlayer episodeId={episode.id} videoUrl={episode.videoKey} />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl bg-black text-[var(--text-dim)]">
              <div className="text-center">
                <p>This premiere has ended.</p>
                <Link href={`/watch/${episode.id}`} className="btn-primary mt-3 inline-flex">
                  Go to the film page
                </Link>
              </div>
            </div>
          )}
          <Link href={`/c/${episode.creator.handle}`} className="mt-3 block text-sm text-[var(--text-dim)] hover:text-[var(--accent)]">
            {episode.creator.channelName}
          </Link>
          {episode.description && <p className="mt-2 text-sm text-[var(--text-dim)]">{episode.description}</p>}
        </div>

        <PremiereRoom
          episodeId={episode.id}
          creatorId={episode.creatorId}
          creatorUserId={episode.creator.userId}
          isModerator={!!viewerState.isModerator}
          viewerSignedIn={!!user}
        />
      </div>
    </div>
  );
}
