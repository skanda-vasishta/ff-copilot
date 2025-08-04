# viz.py
import streamlit as st
import pandas as pd
import json

# Load data
df = pd.read_csv('players.csv')



# Streamlit app
st.title("Fantasy Football Copilot")

# Sidebar for controls
st.sidebar.header("Search Options")

# Search type
search_type = st.sidebar.selectbox(
    "Search Type",
    ["Player Search", "Position Filter"]
)

def parse_sentiment(sentiment_text):
    """Parse sentiment JSON and return structured data"""
    try:
        if pd.notna(sentiment_text) and sentiment_text != "Analysis failed":
            # Remove markdown code blocks if present
            text = sentiment_text.strip()
            if text.startswith('```json'):
                text = text[7:]  # Remove ```json
            if text.endswith('```'):
                text = text[:-3]  # Remove ```
            
            sentiment_data = json.loads(text.strip())
            return sentiment_data
        else:
            return None
    except Exception as e:
        st.write(f"Error parsing sentiment: {e}")
        return None

if search_type == "Player Search":
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
        
        # Player details
        st.subheader("Player Details")
        
        col4, col5 = st.columns(2)
        
        with col4:
            st.write("**Basic Info:**")
            st.write(f"Name: {player_data['name']}")
            st.write(f"Position: {player_data['position']}")
            st.write(f"Team: {player_data['proTeam']}")
            st.write(f"Position Rank: {player_data['posRank'] if pd.notna(player_data['posRank']) else 'N/A'}")
            st.write(f"Lineup Slot: {player_data['lineupSlot']}")
            st.write(f"Acquisition Type: {player_data['acquisitionType']}")
            st.write(f"Injury Status: {player_data['injuryStatus'] if player_data['injuryStatus'] else 'Healthy'}")
            st.write(f"Injured: {'Yes' if player_data['injured'] else 'No'}")
        
        with col5:
            st.write("**Fantasy Stats:**")
            st.write(f"Total Points: {player_data['total_points']:.1f}")
            st.write(f"Average Points: {player_data['avg_points']:.1f}")
            st.write(f"Projected Total Points: {player_data['projected_total_points']:.1f}")
            st.write(f"Projected Average Points: {player_data['projected_avg_points']:.1f}")
            st.write(f"Percent Owned: {player_data['percent_owned']:.1f}%")
            st.write(f"Percent Started: {player_data['percent_started']:.1f}%")
        
        # Sentiment Analysis Cards
        if 'sentiment' in df.columns and pd.notna(player_data['sentiment']):
            sentiment_data = parse_sentiment(player_data['sentiment'])
            
            if sentiment_data:
                st.subheader("Sentiment Analysis")
                
                # Sentiment scores in cards
                col6, col7, col8 = st.columns(3)
                
                with col6:
                    reddit_score = sentiment_data.get('reddit_sentiment_score', 'N/A')
                    if reddit_score != 'N/A':
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
                    if fantasypros_score != 'N/A':
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
                    if overall_score != 'N/A':
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

else:
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
                        if reddit_score != 'N/A':
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
                        if fantasypros_score != 'N/A':
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
                        if overall_score != 'N/A':
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

# Run with: streamlit run viz2.py
