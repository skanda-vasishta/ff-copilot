import requests
params  = {
        "player_name": "Josh Allen",
        "league_id": 600021088,
        "year": 2025,
        "team_name": "FC Skanda",
        "team_id": 1
    }
def test_evaluate_player():
    response = requests.get("http://localhost:8000/evaluate_player", params=params)
    print(f"Status: {response.status_code}")
    print(response.json())


def test_evaluate_all_players():
    response = requests.get("http://localhost:8000/evaluate_all_players", params=params)
    print(f"Status: {response.status_code}")
    print(response.json()[:3])  

def test_add_league_comparisons():
    response = requests.get("http://localhost:8000/add_league_comparisons", params=params)
    print(response.json())
    print(f"Status: {response.status_code}")

def test_evaluate_trade():
    trade_params = {
        "league_id": 600021088,
        "year": 2025,
        "team_name": "FC Skanda",
        "team_id": 1,
        "team1_name": "FC Skanda",
        "team2_name": "Team Venkat",
        "team1_outgoing": ["Omarion Hampton", "Malik Nabers"],
        "team2_outgoing": ["Kenneth Walker III"]
    }
    
    response = requests.get("http://localhost:8000/evaluate_trade", params=trade_params)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        print(response.json())
    else:
        print(f"Error response: {response.text}")

def test_recommend_free_agents():
    fa_params = {
        "league_id": 600021088,
        "year": 2025,
        "team_name": "FC Skanda",
        "team_id": 1,
        # "position": "TE"
    }
    
    response = requests.get("http://localhost:8000/recommend_free_agents", params=fa_params)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Number of recommended WRs: {len(result)}")
        print(result[:5])  
    else:
        print(f"Error response: {response.text}")

def test_get_all_player_raw_stats():
    response = requests.get("http://localhost:8000/get_all_player_raw_stats", params=params)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Total players in raw stats: {len(result)}")
        print("Sample player data:")
        print(result[:3])  
    else:
        print(f"Error response: {response.text}")

def test_get_all_player_sentiment():
    response = requests.get("http://localhost:8000/get_all_player_sentiment", params=params)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Total players in sentiment: {len(result)}")
        print("Sample player data:")
        print(result[:3])  
    else:
        print(f"Error response: {response.text}")

if __name__ == "__main__":
    # test_evaluate_player()
    # test_evaluate_all_players()
    # test_add_league_comparisons()
    # test_evaluate_trade()
    # test_recommend_free_agents()
    # test_get_all_player_raw_stats()
    test_get_all_player_sentiment()