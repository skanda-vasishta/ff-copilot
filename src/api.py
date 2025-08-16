from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List

import pandas as pd
from league_metrics import LeagueMetrics

app = FastAPI()

@app.get("/evaluate_player")
async def evaluate_player(player_name: str, league_id: int, year: int, team_name: str, team_id: int):
    """
    Evaluate a player and return their metrics as JSON
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        result = league_metrics.evaluate_player(player_name)
        
        if result is None:
            raise HTTPException(status_code=404, detail=f"Player '{player_name}' not found")
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/evaluate_all_players")
async def evaluate_all_players(league_id: int, year: int, team_name: str, team_id: int):
    """
    Evaluate all players and return their metrics as JSON
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        result = league_metrics.evaluate_all_players()
        
        return result.to_dict('records')
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/add_league_comparisons")
async def add_league_comparisons(league_id: int, year: int, team_name: str, team_id: int):
    """
    Get league comparisons and return as JSON
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        comparison_df, league_stats = league_metrics.add_league_comparisons()
        
        return {
            "comparisons": comparison_df.to_dict('records'),
            "league_stats": league_stats
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/evaluate_trade")
async def evaluate_trade(
    league_id: int,
    year: int,
    team_name: str,
    team_id: int,
    team1_name: str,
    team2_name: str,
    team1_outgoing: List[str] = Query(),
    team2_outgoing: List[str] = Query()
):
    """
    Evaluate a trade between two teams
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        
        team1 = None
        team2 = None
        for team in league_metrics.league.teams:
            if team.team_name == team1_name:
                team1 = team
            elif team.team_name == team2_name:
                team2 = team
        
        if team1 is None or team2 is None:
            raise HTTPException(status_code=404, detail="One or both teams not found")
        
        result = league_metrics.evaluate_trade(team1, team2, team1_outgoing, team2_outgoing)
        
        return result.to_dict()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    




