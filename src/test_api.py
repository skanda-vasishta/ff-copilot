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
        "team2_name": "Team Name Here",
        "team1_outgoing": ["Omarion Hampton", "Malik Nabers"],
        "team2_outgoing": ["Kenneth Walker III"]
    }
    
    response = requests.get("http://localhost:8000/evaluate_trade", params=trade_params)
    print(f"Status: {response.status_code}")
    print(response.json())

if __name__ == "__main__":
    # test_evaluate_player()
    # test_evaluate_all_players()
    # test_add_league_comparisons()
    test_evaluate_trade()