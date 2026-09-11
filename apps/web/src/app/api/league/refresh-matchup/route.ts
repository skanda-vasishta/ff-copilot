import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshLeagueFromProvider } from "@/features/league/server/refresh";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { leagueId } = await request.json() as { leagueId?: string };
    if (!leagueId) return NextResponse.json({ error: "leagueId is required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: linked, error } = await supabase.from("user_leagues")
      .select("league:leagues(id,provider,external_id,season)")
      .eq("user_id", user.id)
      .eq("league_id", leagueId)
      .maybeSingle();
    if (error) throw error;
    const league = linked?.league;
    if (!league || Array.isArray(league)) return NextResponse.json({ error: "League not found" }, { status: 404 });

    const refreshable = league as unknown as { id: string; provider: "espn" | "sleeper"; external_id: string; season: number };
    await refreshLeagueFromProvider(refreshable);
    return NextResponse.json({ refreshedAt: new Date().toISOString(), provider: refreshable.provider });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not refresh live matchup" }, { status: 502 });
  }
}
