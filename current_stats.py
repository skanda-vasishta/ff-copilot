import pandas as pd
import numpy as np
import json
import requests
import time
from espn_api.football import League
import praw
import os
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import re
from openai import OpenAI



load_dotenv()

def get_fantasy_pros_text(player):
    cleaned_name = re.sub(r'[^a-zA-Z0-9\s]', '', player)
    formatted_name = cleaned_name.replace(' ', '-')
    formatted_name = formatted_name.lower()
    
    if player == "Kenneth Walker III":
        formatted_name = "kenneth-walker-rb"
    if player == "Amon-Ra St. Brown":
        formatted_name = "amonra-stbrown"

    url = f"https://www.fantasypros.com/nfl/notes/{formatted_name}.php"
    # print(url)
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')

    p_tags = soup.find_all('p')

    res = []
    for p in p_tags:
        res.append(p.get_text().strip())
    text_content = '\n'.join(res)

    return text_content

def get_reddit_posts(player):
    reddit = praw.Reddit(
        client_id=os.getenv("REDDIT_CLIENT"),
        client_secret=os.getenv("REDDIT_SECRET"),
        user_agent="ff-copilot-bot/0.1 by /u/lilskanny"
    )
    subreddit = reddit.subreddit("fantasyfootball")

    
    search_results = subreddit.search(player, limit=3, sort='relevance', time_filter="month")
    
    posts = []
    for post in search_results:
        post_data = {
            'title': post.title,
            'selftext': post.selftext,
            'url': post.url,
            'score': post.score,
            'comments': []
        }
        
        post.comments.replace_more(limit=0)  
        for comment in post.comments.list()[:5]:
            post_data['comments'].append(comment.body)
        
        posts.append(post_data)
    
    return posts

def analyze_sentiment(player, reddit_text, fantasy_pros_text):
    client = OpenAI()
    prompt = f"""
    For {player}, analyze the following fantasy football discussion and provide a sentiment score from 1-10:

    REDDIT DISCUSSION:
    {reddit_text}

    FANTASYPROS ANALYSIS:
    {fantasy_pros_text}

    Provide a JSON response with:
    {{
        "reddit_summary": "brief analysis", # 1-2 sentences
        "reddit_sentiment_score": <1-10>, # 1-10
        "fantasypros_summary": "brief analysis", # 1-2 sentences
        "fantasypros_sentiment_score": <1-10>, # 1-10
        "overall_summary": "brief analysis", # 1-2 sentences
        "overall_sentiment_score": <1-10>,
    }}
    """
    models = ["gpt-4o", "gpt-4.1", "gpt-3.5-turbo"]
    for model in models:
        try:
            response = client.responses.create(
                model=model,
                input=prompt
            )
            return response.output_text
        except Exception as e:
            print(f"Error with model {model}: {e}")
            continue

    # print(response.output_text)
    return "Error"

def extract_player_data(player, on_team_id=None):
    posts = get_reddit_posts(player.name)
    reddit_text_parts = []
    for post in posts:
        reddit_text_parts.append(f"Title: {post['title']}")
        if post['selftext']:
            reddit_text_parts.append(f"Post: {post['selftext']}")
        if post['comments']:
            reddit_text_parts.append(f"Comments: {' '.join(post['comments'])}")
        reddit_text_parts.append("---")  
    
    reddit_text = "\n".join(reddit_text_parts)
    fantasy_pros_text = get_fantasy_pros_text(player.name)

    return {
        'name': player.name,
        'playerId': player.playerId,
        'posRank': getattr(player, 'posRank', None),
        'eligibleSlots': json.dumps(getattr(player, 'eligibleSlots', [])),
        'lineupSlot': getattr(player, 'lineupSlot', ''),
        'acquisitionType': getattr(player, 'acquisitionType', ''),
        'proTeam': getattr(player, 'proTeam', ''),
        # 'schedule': json.dumps(getattr(player, 'schedule', {})),
        'onTeamId': on_team_id,
        'position': getattr(player, 'position', ''),
        'injuryStatus': getattr(player, 'injuryStatus', ''),
        'injured': getattr(player, 'injured', False),
        'total_points': getattr(player, 'total_points', 0),
        'avg_points': getattr(player, 'avg_points', 0),
        'projected_total_points': getattr(player, 'projected_total_points', 0),
        'projected_avg_points': getattr(player, 'projected_avg_points', 0),
        'percent_owned': getattr(player, 'percent_owned', 0),
        'percent_started': getattr(player, 'percent_started', 0),
        'stats': json.dumps(getattr(player, 'stats', {})),
        'reddit_text': reddit_text,
        'fantasy_pros_text': fantasy_pros_text,
        'sentiment': analyze_sentiment(player.name, reddit_text, fantasy_pros_text)

    }



if __name__ == "__main__":
    league = League(league_id=600021088, year=2025)

    all_players = []
    for team in league.teams:
        for player in team.roster:
            player_data = extract_player_data(player, on_team_id=league.teams[0].team_id)
            print(player, " processed")
            all_players.append(player_data)

    for player in league.free_agents():
        player_data = extract_player_data(player, on_team_id=None)
        all_players.append(player_data)

    df = pd.DataFrame(all_players)
    df.set_index('playerId', inplace=True)
    df.index.name = 'playerId'

    df.to_csv('players.csv')