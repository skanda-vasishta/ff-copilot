# viz2.py
import streamlit as st
import pandas as pd
import json
from espn_api.football import League
import os
from dotenv import load_dotenv
import re

load_dotenv()

# Initialize session state
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False
if 'espn_connected' not in st.session_state:
    st.session_state.espn_connected = False
if 'league' not in st.session_state:
    st.session_state.league = None
if 'selected_team' not in st.session_state:
    st.session_state.selected_team = None

# Load data
df = pd.read_csv('players.csv')

def extract_league_id_from_url(url):
    """Extract league ID from ESPN fantasy URL"""
    if not url:
        return None
    
    pattern = r'leagueId=(\d+)'
    match = re.search(pattern, url)
    
    if match:
        return match.group(1)
    return None

def parse_sentiment(sentiment_text):
    """Parse sentiment JSON and return structured data"""
    try:
        if pd.notna(sentiment_text) and sentiment_text != "Analysis failed":
            # Remove markdown code blocks if present
            text = sentiment_text.strip()
            if text.startswith('```json'):
                text = text[7:]
            if text.endswith('```'):
                text = text[:-3]
            
            sentiment_data = json.loads(text.strip())
            return sentiment_data
        else:
            return None
    except Exception as e:
        return None

# Sign-in Page
if not st.session_state.authenticated:
    st.title("Fantasy Football Copilot - Sign In")
    
    # Create a simple sign-in form
    with st.form("signin"):
        st.subheader("Connect to Your ESPN League")
        
        espn_url = st.text_input(
            "ESPN League URL", 
            placeholder="https://fantasy.espn.com/football/league?leagueId=600021088",
            help="Paste your ESPN fantasy league URL here"
        )
        
        year = st.number_input("Season Year", min_value=2020, max_value=2025, value=2024)
        
        if st.form_submit_button("Sign In"):
            if espn_url:
                league_id = extract_league_id_from_url(espn_url)
                
                if league_id:
                    try:
                        # Test connection
                        league = League(league_id=int(league_id), year=year)
                        
                        # Store in session state
                        st.session_state.league = league
                        st.session_state.espn_connected = True
                        st.session_state.authenticated = True
                        
                        st.success("Successfully connected to your league!")
                        st.rerun()
                        
                    except Exception as e:
                        st.error(f"Connection failed: {e}")
                else:
                    st.error("Could not extract league ID from URL. Please check the URL format.")
            else:
                st.error("Please enter an ESPN league URL")

# Main App (after authentication)
else:
    # Header
    st.title("Fantasy Football Copilot")
    
    # Team Selection (if not already selected)
    if st.session_state.selected_team is None:
        st.subheader("Select Your Team")
        
        if st.session_state.league:
            league = st.session_state.league
            team_names = [team.team_name for team in league.teams]
            
            selected_team_name = st.selectbox("Choose your team:", team_names)
            
            if st.button("Set as My Team"):
                for team in league.teams:
                    if team.team_name == selected_team_name:
                        st.session_state.selected_team = team
                        st.success(f"Team set to: {team.team_name}")
                        st.rerun()
    
    # Main App Interface
    if st.session_state.selected_team:
        st.sidebar.header("Your Team")
        st.sidebar.write(f"**Team:** {st.session_state.selected_team.team_name}")
        st.sidebar.write(f"**League:** {st.session_state.league.settings.name}")
        st.sidebar.write(f"**Year:** {st.session_state.league.year}")
        
        # Sign out button in sidebar
        if st.sidebar.button("Sign Out"):
            st.session_state.authenticated = False
            st.session_state.espn_connected = False
            st.session_state.league = None
            st.session_state.selected_team = None
            st.rerun()
        
        # Search options
        st.sidebar.header("Search Options")
        search_type = st.sidebar.selectbox(
            "Search Type",
            ["My Team", "League Analysis", "Player Search", "Position Filter"]
        )
        
        # My Team View
        if search_type == "My Team":
            st.header(f"Your Team: {st.session_state.selected_team.team_name}")
            
            # Team stats
            col1, col2, col3 = st.columns(3)
            
            with col1:
                st.metric("Wins", st.session_state.selected_team.wins)
                st.metric("Losses", st.session_state.selected_team.losses)
                st.metric("Ties", st.session_state.selected_team.ties)
            
            with col2:
                st.metric("Points For", f"{st.session_state.selected_team.points_for:.1f}")
                st.metric("Points Against", f"{st.session_state.selected_team.points_against:.1f}")
                st.metric("Standing", st.session_state.selected_team.standing)
            
            with col3:
                st.metric("Roster Size", len(st.session_state.selected_team.roster))
                st.metric("Team ID", st.session_state.selected_team.team_id)
                st.metric("Division", st.session_state.selected_team.division_id)
            
            # Roster breakdown
            st.subheader("Your Roster")
            
            # Group players by position
            position_counts = {}
            for player in st.session_state.selected_team.roster:
                pos = player.position
                if pos not in position_counts:
                    position_counts[pos] = []
                position_counts[pos].append(player)
            
            # Display by position
            for position, players in position_counts.items():
                with st.expander(f"{position} ({len(players)} players)"):
                    for player in players:
                        st.write(f"**{player.name}** ({player.position})")
                        
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            st.write("**Player Info:**")
                            st.write(f"Name: {player.name}")
                            st.write(f"Position: {player.position}")
                            st.write(f"Team: {player.proTeam}")
                            st.write(f"Injury Status: {player.injuryStatus}")
                            st.write(f"Injured: {player.injured}")
                        
                        with col2:
                            st.write("**Stats:**")
                            st.write(f"Total Points: {player.total_points}")
                            st.write(f"Average Points: {player.avg_points}")
                            st.write(f"Projected Total Points: {player.projected_total_points}")
                            st.write(f"Projected Average Points: {player.projected_avg_points}")
                            st.write(f"Percent Owned: {player.percent_owned}")
                            st.write(f"Percent Started: {player.percent_started}")
                        
                        # Sentiment analysis
                        csv_player = df[df['name'] == player.name]
                        if not csv_player.empty:
                            sentiment_text = csv_player['sentiment'].iloc[0]
                            if pd.notna(sentiment_text):
                                sentiment_data = parse_sentiment(sentiment_text)
                                
                                if sentiment_data:
                                    st.write("**Sentiment Analysis:**")
                                    col3, col4, col5 = st.columns(3)
                                    
                                    with col3:
                                        reddit_score = sentiment_data.get('reddit_sentiment_score', 'N/A')
                                        if reddit_score != 'N/A' and reddit_score is not None:
                                            if reddit_score >= 7:
                                                st.success(f"Reddit: {reddit_score}/10")
                                            elif reddit_score >= 5:
                                                st.warning(f"Reddit: {reddit_score}/10")
                                            else:
                                                st.error(f"Reddit: {reddit_score}/10")
                                        else:
                                            st.info("Reddit: N/A")
                                    
                                    with col4:
                                        fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', 'N/A')
                                        if fantasypros_score != 'N/A' and fantasypros_score is not None:
                                            if fantasypros_score >= 7:
                                                st.success(f"FantasyPros: {fantasypros_score}/10")
                                            elif fantasypros_score >= 5:
                                                st.warning(f"FantasyPros: {fantasypros_score}/10")
                                            else:
                                                st.error(f"FantasyPros: {fantasypros_score}/10")
                                        else:
                                            st.info("FantasyPros: N/A")
                                    
                                    with col5:
                                        overall_score = sentiment_data.get('overall_sentiment_score', 'N/A')
                                        if overall_score != 'N/A' and overall_score is not None:
                                            if overall_score >= 7:
                                                st.success(f"Overall: {overall_score}/10")
                                            elif overall_score >= 5:
                                                st.warning(f"Overall: {overall_score}/10")
                                            else:
                                                st.error(f"Overall: {overall_score}/10")
                                        else:
                                            st.info("Overall: N/A")
                                    
                                    # Show summaries
                                    if 'reddit_summary' in sentiment_data:
                                        st.write("**Reddit Summary:**")
                                        st.write(sentiment_data['reddit_summary'])
                                    
                                    if 'fantasypros_summary' in sentiment_data:
                                        st.write("**FantasyPros Summary:**")
                                        st.write(sentiment_data['fantasypros_summary'])
                                    
                                    if 'overall_summary' in sentiment_data:
                                        st.write("**Overall Summary:**")
                                        st.write(sentiment_data['overall_summary'])
                        
                        st.divider()
        
        # League Analysis
        elif search_type == "League Analysis":
            st.header("League Analysis")
            if st.session_state.league:
                league = st.session_state.league
                
                # Get all teams except the user's selected team
                available_teams = [team for team in league.teams if team.team_id != st.session_state.selected_team.team_id]
                team_names = [team.team_name for team in available_teams]
                
                if not team_names:
                    st.info("No other teams available for analysis.")
                else:
                    # Team selection dropdown
                    selected_team_name = st.selectbox("Select a team to analyze:", team_names)
                    
                    # Find the selected team object
                    selected_team = None
                    for team in available_teams:
                        if team.team_name == selected_team_name:
                            selected_team = team
                            break
                    
                    if selected_team:
                        team = selected_team
                    st.subheader(f"{team.team_name} (Wins: {team.wins}, Losses: {team.losses}, Points For: {team.points_for:.1f})")
                    
                    # Group players by position
                    position_counts = {}
                    for player in team.roster:
                        pos = player.position
                        if pos not in position_counts:
                            position_counts[pos] = []
                        position_counts[pos].append(player)
                    
                    # Display by position with sentiment scores
                    for position, players in position_counts.items():
                        # Calculate average sentiment for this position
                        reddit_scores = []
                        fantasypros_scores = []
                        overall_scores = []
                        
                        for player in players:
                            csv_player = df[df['name'] == player.name]
                            sentiment_data = None
                            if not csv_player.empty:
                                sentiment_data = parse_sentiment(csv_player['sentiment'].iloc[0])
                            
                            reddit_score = sentiment_data.get('reddit_sentiment_score', None) if sentiment_data else None
                            fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', None) if sentiment_data else None
                            overall_score = sentiment_data.get('overall_sentiment_score', None) if sentiment_data else None
                            
                            if reddit_score is not None and reddit_score != 'N/A':
                                reddit_scores.append(reddit_score)
                            if fantasypros_score is not None and fantasypros_score != 'N/A':
                                fantasypros_scores.append(fantasypros_score)
                            if overall_score is not None and overall_score != 'N/A':
                                overall_scores.append(overall_score)
                        
                        # Create position header with averages
                        avg_display = f"{position} ({len(players)} players)"
                        if reddit_scores or fantasypros_scores or overall_scores:
                            avg_display += " - "
                            if reddit_scores:
                                avg_reddit = sum(reddit_scores)/len(reddit_scores)
                                if avg_reddit >= 7:
                                    avg_display += f"Reddit average: {avg_reddit:.1f}/10"
                                elif avg_reddit >= 5:
                                    avg_display += f"Reddit average: {avg_reddit:.1f}/10"
                                else:
                                    avg_display += f"Reddit average: {avg_reddit:.1f}/10"
                            if fantasypros_scores:
                                avg_fantasypros = sum(fantasypros_scores)/len(fantasypros_scores)
                                if avg_fantasypros >= 7:
                                    avg_display += f" | FantasyPros average: {avg_fantasypros:.1f}/10"
                                elif avg_fantasypros >= 5:
                                    avg_display += f" | FantasyPros average: {avg_fantasypros:.1f}/10"
                                else:
                                    avg_display += f" | FantasyPros average: {avg_fantasypros:.1f}/10"
                            if overall_scores:
                                avg_overall = sum(overall_scores)/len(overall_scores)
                                if avg_overall >= 7:
                                    avg_display += f" | Overall average: {avg_overall:.1f}/10"
                                elif avg_overall >= 5:
                                    avg_display += f" | Overall average: {avg_overall:.1f}/10"
                                else:
                                    avg_display += f" | Overall average: {avg_overall:.1f}/10"
                        
                        # Display position header with color coding
                        if reddit_scores or fantasypros_scores or overall_scores:
                            # Calculate overall position sentiment
                            all_scores = []
                            if reddit_scores:
                                all_scores.extend(reddit_scores)
                            if fantasypros_scores:
                                all_scores.extend(fantasypros_scores)
                            if overall_scores:
                                all_scores.extend(overall_scores)
                            
                            avg_position_sentiment = sum(all_scores) / len(all_scores) if all_scores else 0
                            
                            if avg_position_sentiment >= 7:
                                with st.expander(avg_display):
                                    st.success(f"Position sentiment: {avg_position_sentiment:.1f}/10")
                                    for player in players:
                                        st.write(f"**{player.name} ({player.position})**")
                                        # Display player with colored sentiment scores
                                        col1, col2, col3 = st.columns([1, 2, 1])
                                        with col1:
                                            pass  # Empty column for centering
                                        
                                        with col2:
                                            # Create 2-column layout for scores and stats
                                            score_col1, score_col2 = st.columns(2)
                                            
                                            with score_col1:
                                                # Reddit score
                                                if reddit_score and reddit_score != 'N/A':
                                                    if reddit_score >= 7:
                                                        st.success(f"Reddit: {reddit_score}/10")
                                                    elif reddit_score >= 5:
                                                        st.warning(f"Reddit: {reddit_score}/10")
                                                    else:
                                                        st.error(f"Reddit: {reddit_score}/10")
                                                else:
                                                    st.info("Reddit: N/A")
                                                
                                                # FantasyPros score
                                                if fantasypros_score and fantasypros_score != 'N/A':
                                                    if fantasypros_score >= 7:
                                                        st.success(f"FantasyPros: {fantasypros_score}/10")
                                                    elif fantasypros_score >= 5:
                                                        st.warning(f"FantasyPros: {fantasypros_score}/10")
                                                    else:
                                                        st.error(f"FantasyPros: {fantasypros_score}/10")
                                                else:
                                                    st.info("FantasyPros: N/A")
                                                
                                                # Overall score
                                                if overall_score and overall_score != 'N/A':
                                                    if overall_score >= 7:
                                                        st.success(f"Overall: {overall_score}/10")
                                                    elif overall_score >= 5:
                                                        st.warning(f"Overall: {overall_score}/10")
                                                    else:
                                                        st.error(f"Overall: {overall_score}/10")
                                                else:
                                                    st.info("Overall: N/A")
                                            
                                            with score_col2:
                                                # Stats in separate colored boxes
                                                injury_status = player.injuryStatus if player.injuryStatus else "ACTIVE"
                                                projected_points = player.projected_total_points
                                                actual_points = player.total_points
                                                
                                                st.info(f"Injury: {injury_status}")
                                                st.info(f"Projected: {projected_points:.1f}")
                                                st.info(f"Actual: {actual_points:.1f}")
                                        
                                        with col3:
                                            pass  # Empty column for centering
                                        
                                        # Re-calculate sentiment data for this specific player
                                        csv_player = df[df['name'] == player.name]
                                        sentiment_data = None
                                        if not csv_player.empty:
                                            sentiment_data = parse_sentiment(csv_player['sentiment'].iloc[0])
                                        
                                        reddit_score = sentiment_data.get('reddit_sentiment_score', None) if sentiment_data else None
                                        fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', None) if sentiment_data else None
                                        overall_score = sentiment_data.get('overall_sentiment_score', None) if sentiment_data else None
                                        
                                        st.divider()
                            elif avg_position_sentiment >= 5:
                                with st.expander(avg_display):
                                    st.warning(f"Position sentiment: {avg_position_sentiment:.1f}/10")
                                    for player in players:
                                        st.write(f"**{player.name} ({player.position})**")
                                        # Display player with colored sentiment scores
                                        col1, col2, col3 = st.columns([1, 2, 1])
                                        with col1:
                                            pass  # Empty column for centering
                                        
                                        with col2:
                                            # Create 2-column layout for scores and stats
                                            score_col1, score_col2 = st.columns(2)
                                            
                                            with score_col1:
                                                # Reddit score
                                                if reddit_score and reddit_score != 'N/A':
                                                    if reddit_score >= 7:
                                                        st.success(f"Reddit: {reddit_score}/10")
                                                    elif reddit_score >= 5:
                                                        st.warning(f"Reddit: {reddit_score}/10")
                                                    else:
                                                        st.error(f"Reddit: {reddit_score}/10")
                                                else:
                                                    st.info("Reddit: N/A")
                                                
                                                # FantasyPros score
                                                if fantasypros_score and fantasypros_score != 'N/A':
                                                    if fantasypros_score >= 7:
                                                        st.success(f"FantasyPros: {fantasypros_score}/10")
                                                    elif fantasypros_score >= 5:
                                                        st.warning(f"FantasyPros: {fantasypros_score}/10")
                                                    else:
                                                        st.error(f"FantasyPros: {fantasypros_score}/10")
                                                else:
                                                    st.info("FantasyPros: N/A")
                                                
                                                # Overall score
                                                if overall_score and overall_score != 'N/A':
                                                    if overall_score >= 7:
                                                        st.success(f"Overall: {overall_score}/10")
                                                    elif overall_score >= 5:
                                                        st.warning(f"Overall: {overall_score}/10")
                                                    else:
                                                        st.error(f"Overall: {overall_score}/10")
                                                else:
                                                    st.info("Overall: N/A")
                                            
                                            with score_col2:
                                                # Stats in separate colored boxes
                                                injury_status = player.injuryStatus if player.injuryStatus else "ACTIVE"
                                                projected_points = player.projected_total_points
                                                actual_points = player.total_points
                                                
                                                st.info(f"Injury: {injury_status}")
                                                st.info(f"Projected: {projected_points:.1f}")
                                                st.info(f"Actual: {actual_points:.1f}")
                                        
                                        with col3:
                                            pass  # Empty column for centering
                                        
                                        # Re-calculate sentiment data for this specific player
                                        csv_player = df[df['name'] == player.name]
                                        sentiment_data = None
                                        if not csv_player.empty:
                                            sentiment_data = parse_sentiment(csv_player['sentiment'].iloc[0])
                                        
                                        reddit_score = sentiment_data.get('reddit_sentiment_score', None) if sentiment_data else None
                                        fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', None) if sentiment_data else None
                                        overall_score = sentiment_data.get('overall_sentiment_score', None) if sentiment_data else None
                                        
                                        st.divider()
                            else:
                                with st.expander(avg_display):
                                    st.error(f"Position sentiment: {avg_position_sentiment:.1f}/10")
                                    for player in players:
                                        st.write(f"**{player.name} ({player.position})**")
                                        # Display player with colored sentiment scores
                                        col1, col2, col3 = st.columns([1, 2, 1])
                                        with col1:
                                            pass  # Empty column for centering
                                        
                                        with col2:
                                            # Create 2-column layout for scores and stats
                                            score_col1, score_col2 = st.columns(2)
                                            
                                            with score_col1:
                                                # Reddit score
                                                if reddit_score and reddit_score != 'N/A':
                                                    if reddit_score >= 7:
                                                        st.success(f"Reddit: {reddit_score}/10")
                                                    elif reddit_score >= 5:
                                                        st.warning(f"Reddit: {reddit_score}/10")
                                                    else:
                                                        st.error(f"Reddit: {reddit_score}/10")
                                                else:
                                                    st.info("Reddit: N/A")
                                                
                                                # FantasyPros score
                                                if fantasypros_score and fantasypros_score != 'N/A':
                                                    if fantasypros_score >= 7:
                                                        st.success(f"FantasyPros: {fantasypros_score}/10")
                                                    elif fantasypros_score >= 5:
                                                        st.warning(f"FantasyPros: {fantasypros_score}/10")
                                                    else:
                                                        st.error(f"FantasyPros: {fantasypros_score}/10")
                                                else:
                                                    st.info("FantasyPros: N/A")
                                                
                                                # Overall score
                                                if overall_score and overall_score != 'N/A':
                                                    if overall_score >= 7:
                                                        st.success(f"Overall: {overall_score}/10")
                                                    elif overall_score >= 5:
                                                        st.warning(f"Overall: {overall_score}/10")
                                                    else:
                                                        st.error(f"Overall: {overall_score}/10")
                                                else:
                                                    st.info("Overall: N/A")
                                            
                                            with score_col2:
                                                # Stats in separate colored boxes
                                                injury_status = player.injuryStatus if player.injuryStatus else "ACTIVE"
                                                projected_points = player.projected_total_points
                                                actual_points = player.total_points
                                                
                                                st.info(f"Injury: {injury_status}")
                                                st.info(f"Projected: {projected_points:.1f}")
                                                st.info(f"Actual: {actual_points:.1f}")
                                        
                                        with col3:
                                            pass  # Empty column for centering
                                        
                                        # Re-calculate sentiment data for this specific player
                                        csv_player = df[df['name'] == player.name]
                                        sentiment_data = None
                                        if not csv_player.empty:
                                            sentiment_data = parse_sentiment(csv_player['sentiment'].iloc[0])
                                        
                                        reddit_score = sentiment_data.get('reddit_sentiment_score', None) if sentiment_data else None
                                        fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', None) if sentiment_data else None
                                        overall_score = sentiment_data.get('overall_sentiment_score', None) if sentiment_data else None
                                        
                                        st.divider()
                        else:
                            with st.expander(avg_display):
                                st.info("No sentiment data available")
                                for player in players:
                                    st.write(f"**{player.name} ({player.position})**")
                                    # Display player with colored sentiment scores
                                    col1, col2, col3 = st.columns([1, 2, 1])
                                    with col1:
                                        pass  # Empty column for centering
                                    
                                    with col2:
                                        # Create 2-column layout for scores and stats
                                        score_col1, score_col2 = st.columns(2)
                                        
                                        with score_col1:
                                            # Reddit score
                                            if reddit_score and reddit_score != 'N/A':
                                                if reddit_score >= 7:
                                                    st.success(f"Reddit: {reddit_score}/10")
                                                elif reddit_score >= 5:
                                                    st.warning(f"Reddit: {reddit_score}/10")
                                                else:
                                                    st.error(f"Reddit: {reddit_score}/10")
                                            else:
                                                st.info("Reddit: N/A")
                                            
                                            # FantasyPros score
                                            if fantasypros_score and fantasypros_score != 'N/A':
                                                if fantasypros_score >= 7:
                                                    st.success(f"FantasyPros: {fantasypros_score}/10")
                                                elif fantasypros_score >= 5:
                                                    st.warning(f"FantasyPros: {fantasypros_score}/10")
                                                else:
                                                    st.error(f"FantasyPros: {fantasypros_score}/10")
                                            else:
                                                st.info("FantasyPros: N/A")
                                            
                                            # Overall score
                                            if overall_score and overall_score != 'N/A':
                                                if overall_score >= 7:
                                                    st.success(f"Overall: {overall_score}/10")
                                                elif overall_score >= 5:
                                                    st.warning(f"Overall: {overall_score}/10")
                                                else:
                                                    st.error(f"Overall: {overall_score}/10")
                                            else:
                                                st.info("Overall: N/A")
                                        
                                        with score_col2:
                                            # Stats in separate colored boxes
                                            injury_status = player.injuryStatus if player.injuryStatus else "ACTIVE"
                                            projected_points = player.projected_total_points
                                            actual_points = player.total_points
                                            
                                            st.info(f"Injury: {injury_status}")
                                            st.info(f"Projected: {projected_points:.1f}")
                                            st.info(f"Actual: {actual_points:.1f}")
                                    
                                    with col3:
                                        pass  # Empty column for centering
                                    
                                    # Re-calculate sentiment data for this specific player
                                    csv_player = df[df['name'] == player.name]
                                    sentiment_data = None
                                    if not csv_player.empty:
                                        sentiment_data = parse_sentiment(csv_player['sentiment'].iloc[0])
                                    
                                    reddit_score = sentiment_data.get('reddit_sentiment_score', None) if sentiment_data else None
                                    fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', None) if sentiment_data else None
                                    overall_score = sentiment_data.get('overall_sentiment_score', None) if sentiment_data else None
                                    
                                    st.divider()

        # Other search types...
        elif search_type == "Player Search":
            st.header("Player Search")
            
            # Player search
            player_name = st.selectbox("Select Player", df['name'].tolist())
            
            if player_name:
                player_data = df[df['name'] == player_name].iloc[0]
                
                # Display player info
                col1, col2, col3 = st.columns(3)
                
                with col1:
                    st.metric("Total Points", f"{player_data['total_points']:.1f}")
                    st.metric("Average Points", f"{player_data['avg_points']:.1f}")
                    st.metric("Projected Points", f"{player_data['projected_total_points']:.1f}")
                
                with col2:
                    st.metric("Percent Owned", f"{player_data['percent_owned']:.1f}%")
                    st.metric("Percent Started", f"{player_data['percent_started']:.1f}%")
                    st.metric("Position Rank", player_data['posRank'] if pd.notna(player_data['posRank']) else "N/A")
                
                with col3:
                    st.metric("Position", player_data['position'])
                    st.metric("Team", player_data['proTeam'])
                    st.metric("Injury Status", player_data['injuryStatus'] if player_data['injuryStatus'] else "Healthy")
                
                
                # Sentiment Analysis Cards
                if 'sentiment' in df.columns and pd.notna(player_data['sentiment']):
                    sentiment_data = parse_sentiment(player_data['sentiment'])
                    
                    if sentiment_data:
                        st.subheader("Sentiment Analysis")
                        
                        # Sentiment scores in cards
                        col6, col7, col8 = st.columns(3)
                        
                        with col6:
                            reddit_score = sentiment_data.get('reddit_sentiment_score', 'N/A')
                            if reddit_score != 'N/A' and reddit_score is not None:
                                # Color based on score
                                if reddit_score >= 7:
                                    st.success(f"Reddit Sentiment: {reddit_score}/10")
                                elif reddit_score >= 5:
                                    st.warning(f"Reddit Sentiment: {reddit_score}/10")
                                else:
                                    st.error(f"Reddit Sentiment: {reddit_score}/10")
                            else:
                                st.info("Reddit Sentiment: N/A")
                            
                            if 'reddit_summary' in sentiment_data:
                                st.write("**Reddit Summary:**")
                                st.write(sentiment_data['reddit_summary'])
                        
                        with col7:
                            fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', 'N/A')
                            if fantasypros_score != 'N/A' and fantasypros_score is not None:
                                if fantasypros_score >= 7:
                                    st.success(f"FantasyPros Sentiment: {fantasypros_score}/10")
                                elif fantasypros_score >= 5:
                                    st.warning(f"FantasyPros Sentiment: {fantasypros_score}/10")
                                else:
                                    st.error(f"FantasyPros Sentiment: {fantasypros_score}/10")
                            else:
                                st.info("FantasyPros Sentiment: N/A")
                            
                            if 'fantasypros_summary' in sentiment_data:
                                st.write("**FantasyPros Summary:**")
                                st.write(sentiment_data['fantasypros_summary'])
                        
                        with col8:
                            overall_score = sentiment_data.get('overall_sentiment_score', 'N/A')
                            if overall_score != 'N/A' and overall_score is not None:
                                if overall_score >= 7:
                                    st.success(f"Overall Sentiment: {overall_score}/10")
                                elif overall_score >= 5:
                                    st.warning(f"Overall Sentiment: {overall_score}/10")
                                else:
                                    st.error(f"Overall Sentiment: {overall_score}/10")
                            else:
                                st.info("Overall Sentiment: N/A")
                            
                            if 'overall_summary' in sentiment_data:
                                st.write("**Overall Summary:**")
                                st.write(sentiment_data['overall_summary'])
                else:
                    st.subheader("Sentiment Analysis")
                    st.info("Sentiment analysis not available or failed.")
                
                # Text data
                st.subheader("Raw Analysis Data")
                
                col9, col10 = st.columns(2)
                
                with col9:
                    st.write("**Reddit Discussion:**")
                    reddit_text = player_data['reddit_text'] if pd.notna(player_data['reddit_text']) else "No Reddit discussion available"
                    st.text_area("Reddit Text", reddit_text, height=300, disabled=True)
                
                with col10:
                    st.write("**FantasyPros Analysis:**")
                    fantasy_pros_text = player_data['fantasy_pros_text'] if pd.notna(player_data['fantasy_pros_text']) else "No FantasyPros analysis available"
                    st.text_area("FantasyPros Text", fantasy_pros_text, height=300, disabled=True)

        elif search_type == "Position Filter":
            st.header("Position Filter")
            
            # Position filter
            position = st.selectbox("Select Position", ["All"] + list(df['position'].unique()))
            
            if position != "All":
                filtered_df = df[df['position'] == position]
            else:
                filtered_df = df
            
            # Sort options
            sort_by = st.selectbox("Sort by", ["total_points", "avg_points", "projected_total_points", "percent_owned", "name"])
            sort_order = st.selectbox("Sort order", ["Descending", "Ascending"])
            
            if sort_order == "Descending":
                filtered_df = filtered_df.sort_values(sort_by, ascending=False)
            else:
                filtered_df = filtered_df.sort_values(sort_by, ascending=True)
            
            # Display filtered results
            st.write(f"**Showing {len(filtered_df)} players**")
            
            # Create expandable sections for each player
            for idx, player in filtered_df.iterrows():
                with st.expander(f"{player['name']} ({player['position']}) - {player['total_points']:.1f} pts"):
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.write("**Stats:**")
                        st.write(f"Total Points: {player['total_points']:.1f}")
                        st.write(f"Average Points: {player['avg_points']:.1f}")
                        st.write(f"Projected Points: {player['projected_total_points']:.1f}")
                        st.write(f"Percent Owned: {player['percent_owned']:.1f}%")
                        st.write(f"Team: {player['proTeam']}")
                        st.write(f"Injury Status: {player['injuryStatus'] if player['injuryStatus'] else 'Healthy'}")
                    
                    with col2:
                        st.write("**Analysis:**")
                        reddit_text = player['reddit_text'] if pd.notna(player['reddit_text']) else "No Reddit discussion"
                        fantasy_pros_text = player['fantasy_pros_text'] if pd.notna(player['fantasy_pros_text']) else "No FantasyPros analysis"
                        
                        if len(reddit_text) > 100:
                            st.write("**Reddit (truncated):**")
                            st.write(reddit_text[:100] + "...")
                        else:
                            st.write("**Reddit:**")
                            st.write(reddit_text)
                        
                        if len(fantasy_pros_text) > 100:
                            st.write("**FantasyPros (truncated):**")
                            st.write(fantasy_pros_text[:100] + "...")
                        else:
                            st.write("**FantasyPros:**")
                            st.write(fantasy_pros_text)
                        
                        # Add sentiment analysis to expandable sections
                        if 'sentiment' in df.columns and pd.notna(player['sentiment']):
                            sentiment_data = parse_sentiment(player['sentiment'])
                            
                            if sentiment_data:
                                st.write("**Sentiment Analysis:**")
                                col3, col4, col5 = st.columns(3)
                                
                                with col3:
                                    reddit_score = sentiment_data.get('reddit_sentiment_score', 'N/A')
                                    if reddit_score != 'N/A' and reddit_score is not None:
                                        if reddit_score >= 7:
                                            st.success(f"Reddit: {reddit_score}/10")
                                        elif reddit_score >= 5:
                                            st.warning(f"Reddit: {reddit_score}/10")
                                        else:
                                            st.error(f"Reddit: {reddit_score}/10")
                                    else:
                                        st.info("Reddit: N/A")
                                
                                with col4:
                                    fantasypros_score = sentiment_data.get('fantasypros_sentiment_score', 'N/A')
                                    if fantasypros_score != 'N/A' and fantasypros_score is not None:
                                        if fantasypros_score >= 7:
                                            st.success(f"FantasyPros: {fantasypros_score}/10")
                                        elif fantasypros_score >= 5:
                                            st.warning(f"FantasyPros: {fantasypros_score}/10")
                                        else:
                                            st.error(f"FantasyPros: {fantasypros_score}/10")
                                    else:
                                        st.info("FantasyPros: N/A")
                                
                                with col5:
                                    overall_score = sentiment_data.get('overall_sentiment_score', 'N/A')
                                    if overall_score != 'N/A' and overall_score is not None:
                                        if overall_score >= 7:
                                            st.success(f"Overall: {overall_score}/10")
                                        elif overall_score >= 5:
                                            st.warning(f"Overall: {overall_score}/10")
                                        else:
                                            st.error(f"Overall: {overall_score}/10")
                                    else:
                                        st.info("Overall: N/A")
                                
                                # Show summaries
                                if 'reddit_summary' in sentiment_data:
                                    st.write("**Reddit Summary:**")
                                    st.write(sentiment_data['reddit_summary'])
                                
                                if 'fantasypros_summary' in sentiment_data:
                                    st.write("**FantasyPros Summary:**")
                                    st.write(sentiment_data['fantasypros_summary'])
                                
                                if 'overall_summary' in sentiment_data:
                                    st.write("**Overall Summary:**")
                                    st.write(sentiment_data['overall_summary'])

