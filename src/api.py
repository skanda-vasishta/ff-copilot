from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Annotated
import pandas as pd
from league_metrics import LeagueMetrics
from datetime import datetime, timedelta, timezone
import jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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
        
        # More thorough cleaning of the data
        import numpy as np
        
        # Convert to records first, then clean each record
        roster_records = roster_df.to_dict('records')
        
        def clean_value(value):
            """Clean a single value to ensure JSON compliance"""
            if pd.isna(value) or value is None:
                return 0
            if isinstance(value, float):
                if np.isinf(value) or np.isnan(value):
                    return 0
                # Check for extremely large values that might cause JSON issues
                if abs(value) > 1e308:
                    return 0
            return value
        
        def clean_dict(d):
            """Recursively clean a dictionary"""
            if isinstance(d, dict):
                return {k: clean_dict(v) for k, v in d.items()}
            elif isinstance(d, list):
                return [clean_dict(item) for item in d]
            else:
                return clean_value(d)
        
        # Clean all records
        roster_clean = [clean_dict(record) for record in roster_records]
        
        return roster_clean
        
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

@app.get("/get_teams_auth")
async def get_teams_auth(league_id: int, year: int):
    """
    Get all team names for authentication
    """
    from espn_api.football import League
    try:
        league = League(league_id, year)
        teams = league.teams
        team_names = [[team.team_name, team.team_id] for team in teams]
        return {"teams": team_names}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



### AUTH STUFF
# to get a string like this run:
# openssl rand -hex 32
SECRET_KEY = os.getenv("AUTH_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


fake_users_db = {
    "demo@example.com": {
        "email": "demo@example.com",
        "name": "Demo User",
        "league_id": 600021088,
        "year": 2025,
        "team_name": "FC Skanda",
        "team_id": 1,
        "hashed_password": "$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",  # password
        "disabled": False,
    }
}


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


class User(BaseModel):
    email: str
    name: str
    league_id: int
    year: int
    team_name: str
    team_id: int
    disabled: bool | None = None


class UserInDB(User):
    hashed_password: str


class UserCreate(BaseModel):
    name: str
    email: str
    league_id: int
    year: int
    team_name: str
    team_id: int
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")



def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def get_user(db, email: str):
    if email in db:
        user_dict = db[email]
        return UserInDB(**user_dict)


def authenticate_user(fake_db, email: str, password: str):
    user = get_user(fake_db, email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(username=email)
    except InvalidTokenError:
        raise credentials_exception
    user = get_user(fake_users_db, email=token_data.username)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


@app.post("/auth/login")
async def login(login_data: LoginRequest) -> dict:
    user = authenticate_user(fake_users_db, login_data.email, login_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "email": user.email,
            "name": user.name,
            "league_id": user.league_id,
            "year": user.year,
            "team_name": user.team_name,
            "team_id": user.team_id
        }
    }


@app.post("/auth/signup")
async def signup(user_data: UserCreate) -> dict:
    # Check if user already exists
    if user_data.email in fake_users_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    fake_users_db[user_data.email] = {
        "email": user_data.email,
        "name": user_data.name,
        "league_id": user_data.league_id,
        "year": user_data.year,
        "team_name": user_data.team_name,
        "team_id": user_data.team_id,
        "hashed_password": hashed_password,
        "disabled": False,
    }
    
    # Auto-login after signup
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_data.email}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "email": user_data.email,
            "name": user_data.name,
            "league_id": user_data.league_id,
            "year": user_data.year,
            "team_name": user_data.team_name,
            "team_id": user_data.team_id
        }
    }


# Keep the original token endpoint for compatibility
@app.post("/token")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    user = authenticate_user(fake_users_db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")


@app.get("/users/me/", response_model=User)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    return current_user


@app.get("/users/me/items/")
async def read_own_items(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    return [{"item_id": "Foo", "owner": current_user.username}]