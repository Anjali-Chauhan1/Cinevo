import { NextRequest } from "next/server";
import { withApiErrors } from "@/lib/api";
import { fileResponse, resolveMediaFile } from "@/lib/media";

// Thumbnails are public; file names are random and never reused, so they
// can be cached forever.
export const GET = withApiErrors(async (req: NextRequest, { params }: { params: { name: string } }) => {
  const file = await resolveMediaFile("thumbnail", params.name);
  return fileResponse(file, req.headers.get("range"), "public, max-age=31536000, immutable");
});
