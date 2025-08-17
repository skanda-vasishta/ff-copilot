from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

import pandas as pd
from league_metrics import LeagueMetrics

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allows requests from Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    
@app.get("/get_team_analysis")
async def get_team_analysis(league_id: int, year: int, team_name: str, team_id: int):
    """
    Get league comparisons and return as JSON
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        comparison_df, league_stats = league_metrics.add_league_comparisons()
        #need to find df row for team_name
        team_row = comparison_df[comparison_df['team_name'] == team_name]
        
        return {
            "team_row": team_row.to_dict('records'),
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
        
        result_clean = result.fillna(0).replace([float('inf'), float('-inf')], 0)
        return result_clean.to_dict()
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/recommend_free_agents")
async def recommend_free_agents(
    league_id: int,
    year: int,
    team_name: str,
    team_id: int,
    position: Optional[str] = None,
    sort_by_score: str = "composite_score"
):
    """
    Recommend free agents for the team
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        result = league_metrics.recommend_free_agents(position=position, sort_by_score=sort_by_score)
        
        return result.to_dict('records')
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get_all_player_raw_stats")
async def get_all_player_raw_stats(league_id: int, year: int, team_name: str, team_id: int):
    """
    Get all raw player statistics
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        result = league_metrics.get_all_player_raw_stats()
        
        result_clean = result.fillna(0).replace([float('inf'), float('-inf')], 0)
        return result_clean.to_dict('records')
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/get_all_player_sentiment")
async def get_all_player_sentiment(league_id: int, year: int, team_name: str, team_id: int):
    """
    Get all player sentiment
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        result = league_metrics.get_all_player_sentiment()
        result_clean = result.fillna(0).replace([float('inf'), float('-inf')], 0)
        return result_clean.to_dict('records')
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/get_team_roster")
async def get_team_roster(league_id: int, year: int, team_name: str, team_id: int):
    """
    Get team roster with player evaluations
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        roster_df = league_metrics.get_team_roster()
        
        roster_clean = roster_df.fillna(0).replace([float('inf'), float('-inf')], 0)
        return roster_clean.to_dict('records')
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/get_all_player_names")
async def get_all_player_names(league_id: int, year: int, team_name: str, team_id: int):
    """
    Get all player names for autocomplete functionality
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        stats_df = league_metrics.get_all_player_raw_stats()
        
        player_names = stats_df['name'].unique().tolist()
        return {"player_names": player_names}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/get_all_team_names")
async def get_all_team_names(league_id: int, year: int, team_name: str, team_id: int):
    """
    Get all team names for autocomplete functionality
    """
    try:
        league_metrics = LeagueMetrics(league_id, year, team_name, team_id)
        team_names = league_metrics.get_all_team_names()
        return {"team_names": team_names}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    




