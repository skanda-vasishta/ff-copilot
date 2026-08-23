import { NextRequest, NextResponse } from "next/server";
import { espnDraftUrl } from "@/lib/espn-draft";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const leagueId = request.nextUrl.searchParams.get("leagueId");
  const season = Number(request.nextUrl.searchParams.get("season"));

  if (!leagueId || !/^\d+$/.test(leagueId) || !Number.isInteger(season)) {
    return NextResponse.json(
      { error: "A numeric leagueId and season are required." },
      { status: 400 },
    );
  }

  const upstreamUrl = new URL(espnDraftUrl(leagueId, season));
  // ESPN's read API is CDN-backed. A unique query value plus no-store prevents
  // a live draft poll from being satisfied by a stale edge/browser response.
  upstreamUrl.searchParams.set("_ffPoll", Date.now().toString());

  const response = await fetch(upstreamUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, max-age=0",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `ESPN returned ${response.status}.` },
      {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return new NextResponse(await response.text(), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
