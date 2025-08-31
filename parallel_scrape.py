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
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from functools import wraps
import random

load_dotenv()

# Thread-safe rate limiting
class RateLimiter:
    def __init__(self, max_calls_per_second=2):
        self.max_calls_per_second = max_calls_per_second
        self.lock = threading.Lock()
        self.last_call_time = {}
    
    def wait_if_needed(self, key):
        with self.lock:
            current_time = time.time()
            if key in self.last_call_time:
                time_since_last = current_time - self.last_call_time[key]
                if time_since_last < 1.0 / self.max_calls_per_second:
                    sleep_time = (1.0 / self.max_calls_per_second) - time_since_last
                    time.sleep(sleep_time)
            self.last_call_time[key] = time.time()

# Global rate limiters for different APIs
reddit_limiter = RateLimiter(max_calls_per_second=1)  # Reddit API is more restrictive
fantasy_pros_limiter = RateLimiter(max_calls_per_second=3)
espn_limiter = RateLimiter(max_calls_per_second=3)
openai_limiter = RateLimiter(max_calls_per_second=2)

def retry_on_failure(max_retries=3, delay=1):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        print(f"Failed after {max_retries} attempts for {func.__name__}: {e}")
                        return None
                    time.sleep(delay * (2 ** attempt) + random.uniform(0, 1))
            return None
        return wrapper
    return decorator

@retry_on_failure(max_retries=3)
def get_fantasy_pros_text(player):
    fantasy_pros_limiter.wait_if_needed('fantasy_pros')
    
    cleaned_name = re.sub(r'[^a-zA-Z0-9\s]', '', player)
    formatted_name = cleaned_name.replace(' ', '-')
    formatted_name = formatted_name.lower()
    
    if player == "Kenneth Walker III":
        formatted_name = "kenneth-walker-rb"
    if player == "Amon-Ra St. Brown":
        formatted_name = "amonra-stbrown"

    url = f"https://www.fantasypros.com/nfl/notes/{formatted_name}.php"
    
    response = requests.get(url, timeout=10)
    soup = BeautifulSoup(response.content, 'html.parser')

    p_tags = soup.find_all('p')

    res = []
    for p in p_tags:
        res.append(p.get_text().strip())
    text_content = '\n'.join(res)

    return text_content

@retry_on_failure(max_retries=3)
def get_reddit_posts(player):
    reddit_limiter.wait_if_needed('reddit')
    
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

@retry_on_failure(max_retries=3)
def get_espn_text(playerId, playerName):
    espn_limiter.wait_if_needed('espn')
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
    }

    formatted_name = playerName.replace(' ', '-')
    formatted_name = formatted_name.lower()
    url = f"https://www.espn.com/nfl/player/_/id/{playerId}/{formatted_name}"

    response = requests.get(url, headers=headers, timeout=10)
    soup = BeautifulSoup(response.content, 'html.parser')

    news = soup.find('div', class_='FantasyOverview__News pa4')
    if news:
        news_text = news.get_text(strip=True, separator='\n\n')
    else:
        news_text = "No news found"
    return news_text

@retry_on_failure(max_retries=3)
def analyze_sentiment(player, reddit_text, fantasy_pros_text, espn_text):
    openai_limiter.wait_if_needed('openai')
    
    client = OpenAI()
    prompt = f"""
    For {player}, analyze the following fantasy football discussion and provide a sentiment score from 1-10:

    REDDIT DISCUSSION:
    {reddit_text}

    FANTASYPROS ANALYSIS:
    {fantasy_pros_text}

    ESPN ANALYSIS:
    {espn_text}

    Provide a JSON response with:
    {{
        "reddit_summary": "brief analysis", # 1-2 sentences
        "reddit_sentiment_score": <1-10>, # 1-10
        "fantasypros_summary": "brief analysis", # 1-2 sentences
        "fantasypros_sentiment_score": <1-10>, # 1-10
        "espn_summary": "brief analysis", # 1-2 sentences
        "espn_sentiment_score": <1-10>, # 1-10
        "overall_summary": "brief analysis", # 2-3 sentences
        "overall_sentiment_score": <1-10>,
    }}
    """
    models = [
        "gpt-4o-mini", 
        "gpt-4.1-mini", 
        "gpt-4.1-nano",
    ]
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

    return "Error"

def scrape_player_data_parallel(player):
    """Scrape all data for a player in parallel"""
    print(f"Starting parallel scrape for {player.name}")
    
    # Create a thread pool for this player's data collection
    with ThreadPoolExecutor(max_workers=4) as executor:
        # Submit all four tasks
        future_reddit = executor.submit(get_reddit_posts, player.name)
        future_fantasy_pros = executor.submit(get_fantasy_pros_text, player.name)
        future_espn = executor.submit(get_espn_text, player.playerId, player.name)
        
        # Wait for the first three to complete before starting sentiment analysis
        reddit_posts = future_reddit.result()
        fantasy_pros_text = future_fantasy_pros.result()
        espn_text = future_espn.result()
        
        # Process reddit text
        reddit_text_parts = []
        if reddit_posts:
            for post in reddit_posts:
                reddit_text_parts.append(f"Title: {post['title']}")
                if post['selftext']:
                    reddit_text_parts.append(f"Post: {post['selftext']}")
                if post['comments']:
                    reddit_text_parts.append(f"Comments: {' '.join(post['comments'])}")
                reddit_text_parts.append("---")  
        
        reddit_text = "\n".join(reddit_text_parts) if reddit_text_parts else "No reddit data found"
        
        # Now submit sentiment analysis
        future_sentiment = executor.submit(analyze_sentiment, player.name, reddit_text, fantasy_pros_text, espn_text)
        sentiment = future_sentiment.result()

    print(f"Completed parallel scrape for {player.name}")
    
    return {
        'name': player.name,
        'playerId': player.playerId,
        'reddit_text': reddit_text,
        'fantasy_pros_text': fantasy_pros_text or "No fantasy pros data found",
        'espn_text': espn_text or "No ESPN data found",
        'sentiment': sentiment or "Error in sentiment analysis",
    }

def get_player_stats(player, on_team_id=None):
    return {
        'name': player.name,
        'playerId': player.playerId,
        'posRank': getattr(player, 'posRank', None),
        'eligibleSlots': json.dumps(getattr(player, 'eligibleSlots', [])),
        'lineupSlot': getattr(player, 'lineupSlot', ''),
        'acquisitionType': getattr(player, 'acquisitionType', ''),
        'proTeam': getattr(player, 'proTeam', ''),
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
    }

def process_players_parallel(players, max_workers=5):
    """Process multiple players in parallel with controlled concurrency"""
    stats = []
    scraped_info = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all player processing tasks
        future_to_player = {}
        for player in players:
            future = executor.submit(scrape_player_data_parallel, player)
            future_to_player[future] = player
        
        # Collect results as they complete
        for future in as_completed(future_to_player):
            player = future_to_player[future]
            try:
                player_scraped_info = future.result()
                player_data = get_player_stats(player)
                
                stats.append(player_data)
                scraped_info.append(player_scraped_info)
                
                print(f"✓ {player.name} completed")
                
            except Exception as e:
                print(f"✗ Error processing {player.name}: {e}")
                # Add basic player data even if scraping failed
                player_data = get_player_stats(player)
                stats.append(player_data)
                scraped_info.append({
                    'name': player.name,
                    'playerId': player.playerId,
                    'reddit_text': "Error in scraping",
                    'fantasy_pros_text': "Error in scraping",
                    'espn_text': "Error in scraping",
                    'sentiment': "Error in scraping",
                })
    
    return stats, scraped_info

if __name__ == "__main__":
    time_start = time.time()
    league = League(league_id=251954166, year=2025)

    # Collect all players
    all_players = []
    
    # Add roster players
    for team in league.teams:
        for player in team.roster:
            all_players.append(player)
    
    # Add free agents
    free_agents = league.free_agents(size=100)
    all_players.extend(free_agents)
    
    print(f"Total players to process: {len(all_players)}")
    
    # Process all players in parallel
    stats, scraped_info = process_players_parallel(all_players, max_workers=5)
    
    # Save results
    df_stats = pd.DataFrame(stats)
    df_stats.set_index('playerId', inplace=True)
    df_stats.index.name = 'playerId'
    df_stats.to_csv('player_stats.csv')

    df_scraped_info = pd.DataFrame(scraped_info)
    df_scraped_info.set_index('playerId', inplace=True)
    df_scraped_info.index.name = 'playerId'
    df_scraped_info.to_csv('player_scraped_info.csv')
    
    time_end = time.time()
    print(f"Time taken: {(time_end - time_start)/60:.2f} minutes")
    print(f"Processed {len(stats)} players successfully")