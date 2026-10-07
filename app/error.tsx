"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="empty-state" role="alert"><Icon name="film" size={36} /><h1 className="text-2xl">A brief intermission.</h1><p>We couldn&apos;t load this page. Please try again in a moment.</p><button onClick={reset} className="btn-primary">Try again</button><Link href="/" className="text-link">Back to Discover</Link></div>;
}
