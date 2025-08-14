import pandas as pd
import json
from espn_api.football import League
import numpy as np

class LeagueMetrics:
    def __init__(self, league_id, year, team_name, team_id):
        self.league_id = league_id
        self.league = League(league_id, year)
        self.year = year
        self.team_name = team_name
        self.team_id = team_id
        # following two might have to change
        self.stats_df = pd.read_csv('../data/player_stats.csv')
        self.sentiment_df = pd.read_csv('../data/player_scraped_info.csv')
        self.all_players_stats = self.evaluate_all_players()
        self.league_team_stats = self.evaluate_all_teams()
        self.league_comparisons, _ = self.add_league_comparisons()
        self.free_agents = self.league.free_agents(size=50)
        
    def parse_sentiment_json(self,sentiment_str):
        try:
            if sentiment_str.startswith('```json\n'):
                json_content = sentiment_str[8:]
                if json_content.endswith('\n```'):
                    json_content = json_content[:-4]
                sentiment_data = json.loads(json_content)
                return sentiment_data.get('overall_sentiment_score', 5)
        except:
            return 5
    
    def evaluate_player(self, player_name):
        player = self.stats_df[self.stats_df['name'] == player_name]
        if player.empty:
            return None
        
        player = player.iloc[0]
        position = player['position']
        position_players = self.stats_df[self.stats_df['position'] == position].copy()
        
        position_points = position_players['projected_total_points'].sort_values(ascending=False)
        player_rank = position_points.rank(method='max', ascending=False)[player.name]
        total_at_position = len(position_players)
        production_percentile = (total_at_position - player_rank + 1) / total_at_position
        
        injury_score = {
            'ACTIVE': 1.0,
            'QUESTIONABLE': 0.7,
            'DOUBTFUL': 0.4,
            'OUT': 0.2,
            'IR': 0.1
        }.get(player['injuryStatus'], 0.8)
        
        ownership_confidence = (player['percent_owned'] + player['percent_started']) / 200
        reliability_score = (injury_score * 0.6 + ownership_confidence * 0.4)
        
        player_sentiment_data = self.sentiment_df[self.sentiment_df['name'] == player_name]
        if not player_sentiment_data.empty:
            raw_sentiment = self.parse_sentiment_json(player_sentiment_data.iloc[0]['sentiment'])
            sentiment_score = (raw_sentiment or 5) / 10 
        else:
            sentiment_score = 0.5
        
        position_players.loc[:, 'value_metric'] = position_players['projected_total_points'] / (position_players['percent_owned'] + 1)
        value_rank = position_players['value_metric'].rank(method='max', ascending=False)
        player_value_rank = value_rank.loc[player.name] if player.name in value_rank.index else len(position_players)/2
        value_percentile = (total_at_position - player_value_rank + 1) / total_at_position
        
        composite_score = (
            production_percentile * 0.50 +
            reliability_score * 0.30 +
            sentiment_score * 0.10 +
            value_percentile * 0.10
        )
        
        return {
            'name': player_name,
            'position': position,
            'composite_score': round(composite_score, 3),
            'production_score': round(production_percentile, 3),
            'reliability_score': round(reliability_score, 3),
            'sentiment_score': round(sentiment_score, 3),
            'value_score': round(value_percentile, 3),
            'position_rank': int(player_rank),
        }
    


    def custom_scale(self, values, target_min=0.65, target_max=0.95):
        p5, p95 = np.percentile(values, [5, 95])
        scaled = (values - p5) / (p95 - p5) * (target_max - target_min) + target_min
        return np.clip(scaled, target_min - 0.05, target_max + 0.05)

    def evaluate_all_players(self):
        all_results = []
        players = self.stats_df['name'].unique()

        for player in players:
            result = self.evaluate_player(player)
            if result:
                all_results.append(result)

        results_df = pd.DataFrame(all_results)
        return results_df
    
    def evaluate_all_teams(self):
        team_evaluations = []
        for team in self.league.teams:
            wrs, qbs, tes, rbs, dsts, k = [], [], [], [], [], []
            for player in team.roster:
                eval = self.evaluate_player(player.name)
                if not eval:
                    continue
                res = [eval['name'], eval['composite_score']]
                if eval['position'] == 'WR':
                    wrs.append(res)
                elif eval['position'] == 'QB':
                    qbs.append(res)
                elif eval['position'] == 'TE':
                    tes.append(res)
                elif eval['position'] == 'RB':
                    rbs.append(res)
                elif eval['position'] == 'D/ST':
                    dsts.append(res)
                elif eval['position'] == 'K':
                    k.append(res)
            sorted_wrs = sorted(wrs, key=lambda x: x[1], reverse=True)
            sorted_rbs = sorted(rbs, key=lambda x: x[1], reverse=True)
            sorted_tes = sorted(tes, key=lambda x: x[1], reverse=True)
            sorted_qbs = sorted(qbs, key=lambda x: x[1], reverse=True)
            sorted_dsts = sorted(dsts, key=lambda x: x[1], reverse=True)
            sorted_k = sorted(k, key=lambda x: x[1], reverse=True)

            starting_wr_score = np.mean([x[1] for x in sorted_wrs[:2]])
            starting_rb_score = np.mean([x[1] for x in sorted_rbs[:2]])
            starting_te_score = sorted_tes[0][1]
            starting_qbs_score = sorted_qbs[0][1]
            dst_score = np.mean([x[1] for x in sorted_dsts])
            k_score = np.mean([x[1] for x in sorted_k])

            bench_wr_score, bench_rb_score, bench_te_score, bench_qbs_score = 0,0,0,0
            if len(sorted_wrs) > 2: 
                bench_scores = [x[1] for x in sorted_wrs[2:4]]
                bench_wr_score = np.mean(bench_scores)
                if len(bench_scores) == 1:
                    bench_wr_score *= 0.75
            if len(sorted_rbs) > 2:
                bench_scores = [x[1] for x in sorted_rbs[2:4]]
                bench_rb_score = np.mean(bench_scores)
                if len(bench_scores) == 1:
                    bench_rb_score *= 0.75
            if len(sorted_tes) > 1:
                # bench_te_score = np.mean([x[1] for x in sorted_tes[1:]])
                bench_te_score = sorted_tes[1][1]
            if len(sorted_qbs) > 1:
                # bench_qbs_score = np.mean([x[1] for x in sorted_qbs[1:]])
                bench_qbs_score = sorted_qbs[1][1]

        

            team_stats = {
                'team_name': team.team_name,
                'team_id': team.team_id,
                'starting_wr_score': starting_wr_score,
                'starting_rb_score': starting_rb_score,
                'starting_te_score': starting_te_score,
                'starting_qbs_score': starting_qbs_score,
                'dst_score': dst_score,
                'k_score': k_score,
                'bench_wr_score': bench_wr_score,
                'bench_rb_score': bench_rb_score,
                'bench_te_score': bench_te_score,
                'bench_qbs_score': bench_qbs_score,
            }
            position_weights = {
                'starting_wr': {'weight': 3, 'count': 2},
                'starting_rb': {'weight': 2.5, 'count': 2}, 
                'starting_te': {'weight': 1.0, 'count': 1},
                'starting_qbs': {'weight': 1.0, 'count': 1},
                'dst': {'weight': 0.5, 'count': 1},
                'k': {'weight': 0.5, 'count': 1},
                'bench_wr': {'weight': 0.25, 'count': 2},
                'bench_rb': {'weight': 0.25, 'count': 2},
                'bench_te': {'weight': 0.1, 'count': 1},
                'bench_qbs': {'weight': 0.1, 'count': 1},
            }

            total_weighted_score = 0
            total_weight = 0

            for pos, config in position_weights.items():
                score = team_stats[f'{pos}_score']
                weight = config['weight']
                count = max(config['count'], 0)  
                
                contribution = score * weight * count
                total_weighted_score += contribution
                total_weight += weight * count

            overall_score = total_weighted_score / total_weight if total_weight > 0 else 0
            team_stats['overall_score'] = overall_score
            team_evaluations.append(team_stats)
            # print(json.dumps(team_stats, indent=4))
            # print()
        
        team_df = pd.DataFrame(team_evaluations)
        team_df['overall_score'] = self.custom_scale(team_df['overall_score'].values)    
        return team_df


    def add_league_comparisons(self):
        """
        Add league-wide statistical comparisons for each position and overall scores.
        """
        
        position_cols = [
            'starting_wr_score', 'starting_rb_score', 'starting_te_score', 
            'starting_qbs_score', 'dst_score', 'k_score',
            'bench_wr_score', 'bench_rb_score', 'bench_te_score', 
            'bench_qbs_score', 
            'overall_score'
        ]
        
        league_stats = {}
        for col in position_cols:
            league_stats[col] = {
                'mean': self.league_team_stats[col].mean(),
                'std': self.league_team_stats[col].std(),
                'min': self.league_team_stats[col].min(),
                'max': self.league_team_stats[col].max(),
                'median': self.league_team_stats[col].median()
            }
        
        comparison_df = self.league_team_stats.copy()[position_cols]
    
        comparison_df['team_name'] = self.league_team_stats['team_name']
        comparison_df['team_id'] = self.league_team_stats['team_id']
        
        for col in position_cols:
            zscore = (self.league_team_stats[col] - league_stats[col]['mean']) / league_stats[col]['std']
            comparison_df[f'{col}_percentile'] = self.league_team_stats[col].rank(pct=True) * 100
            comparison_df[f'{col}_tier'] = zscore.apply(self.classify_tier)    
        return comparison_df, league_stats

    def classify_tier(self, zscore):
        if zscore >= 1.5:
            return "A"
        elif zscore >= 0.5:
            return "B"
        elif zscore >= -0.5:
            return "C"
        elif zscore >= -1.5:
            return "D"
        else:
            return "F"


    def evaluate_teams_trade(self, team1_name, team2_name, team1_roster, team2_roster):
        team_evaluations = []
        for team in team1_roster, team2_roster:
            wrs, qbs, tes, rbs, dsts, k = [], [], [], [], [], []
            for player in team:
                eval = self.evaluate_player(player)
                res = [eval['name'], eval['composite_score']]
                if eval['position'] == 'WR':
                    wrs.append(res)
                elif eval['position'] == 'QB':
                    qbs.append(res)
                elif eval['position'] == 'TE':
                    tes.append(res)
                elif eval['position'] == 'RB':
                    rbs.append(res)
                elif eval['position'] == 'D/ST':
                    dsts.append(res)
                elif eval['position'] == 'K':
                    k.append(res)
            sorted_wrs = sorted(wrs, key=lambda x: x[1], reverse=True)
            sorted_rbs = sorted(rbs, key=lambda x: x[1], reverse=True)
            sorted_tes = sorted(tes, key=lambda x: x[1], reverse=True)
            sorted_qbs = sorted(qbs, key=lambda x: x[1], reverse=True)
            sorted_dsts = sorted(dsts, key=lambda x: x[1], reverse=True)
            sorted_k = sorted(k, key=lambda x: x[1], reverse=True)

            starting_wr_score = np.mean([x[1] for x in sorted_wrs[:2]])
            starting_rb_score = np.mean([x[1] for x in sorted_rbs[:2]])
            starting_te_score = sorted_tes[0][1]
            starting_qbs_score = sorted_qbs[0][1]
            dst_score = np.mean([x[1] for x in sorted_dsts])
            k_score = np.mean([x[1] for x in sorted_k])

            bench_wr_score, bench_rb_score, bench_te_score, bench_qbs_score = 0,0,0,0
            if len(sorted_wrs) > 2: 
                bench_scores = [x[1] for x in sorted_wrs[2:4]]
                bench_wr_score = np.mean(bench_scores)
                if len(bench_scores) == 1:
                    bench_wr_score *= 0.75
            if len(sorted_rbs) > 2:
                bench_scores = [x[1] for x in sorted_rbs[2:4]]
                bench_rb_score = np.mean(bench_scores)
                if len(bench_scores) == 1:
                    bench_rb_score *= 0.75
            if len(sorted_tes) > 1:
                bench_te_score = sorted_tes[1][1]
            if len(sorted_qbs) > 1:
                bench_qbs_score = sorted_qbs[1][1]

        

            team_stats = {
                'team_name': team1_name if team == team1_roster else team2_name,
                # 'team_id': team1_id if team == team1_roster else team2_id,
                'starting_wr_score': starting_wr_score,
                'starting_rb_score': starting_rb_score,
                'starting_te_score': starting_te_score,
                'starting_qbs_score': starting_qbs_score,
                'dst_score': dst_score,
                'k_score': k_score,
                'bench_wr_score': bench_wr_score,
                'bench_rb_score': bench_rb_score,
                'bench_te_score': bench_te_score,
                'bench_qbs_score': bench_qbs_score,
            }
            position_weights = {
                'starting_wr': {'weight': 3, 'count': 2},
                'starting_rb': {'weight': 2.5, 'count': 2}, 
                'starting_te': {'weight': 1.0, 'count': 1},
                'starting_qbs': {'weight': 1.0, 'count': 1},
                'dst': {'weight': 0.5, 'count': 1},
                'k': {'weight': 0.5, 'count': 1},
                'bench_wr': {'weight': 0.25, 'count': 2},
                'bench_rb': {'weight': 0.25, 'count': 2},
                'bench_te': {'weight': 0.1, 'count': 1},
                'bench_qbs': {'weight': 0.1, 'count': 1},
            }

            total_weighted_score = 0
            total_weight = 0

            for pos, config in position_weights.items():
                score = team_stats[f'{pos}_score']
                weight = config['weight']
                count = max(config['count'], 0)  
                
                contribution = score * weight * count
                total_weighted_score += contribution
                total_weight += weight * count

            overall_score = total_weighted_score / total_weight if total_weight > 0 else 0
            team_stats['overall_score'] = overall_score
            team_evaluations.append(team_stats)
            # print(json.dumps(team_stats, indent=4))
            # print()
        
        team_df = pd.DataFrame(team_evaluations)
        # team_df['overall_score'] = self.custom_scale(team_df['overall_score'].values)    
        return team_df
    

    def evaluate_trade(self, team1, team2, team1_outgoing, team2_outgoing):
        team1_roster = [player.name for player in team1.roster]
        team2_roster = [player.name for player in team2.roster] 

        before_trade = self.evaluate_teams_trade(team1, team2, team1_roster, team2_roster)
        
        new_team1_roster = [p for p in team1_roster if p not in team1_outgoing] + team2_outgoing
        new_team2_roster = [p for p in team2_roster if p not in team2_outgoing] + team1_outgoing
        
        after_trade = self.evaluate_teams_trade(team1, team2, new_team1_roster, new_team2_roster)
        
        # Calculate changes
        team1_change = float(after_trade.iloc[0]['overall_score']) - float(before_trade.iloc[0]['overall_score'])
        team2_change = float(after_trade.iloc[1]['overall_score']) - float(before_trade.iloc[1]['overall_score'])
        
        # Determine winner
        if team1_change > team2_change:
            winner_name = team1.team_name
            winner_gain = team1_change
        else:
            winner_name = team2.team_name
            winner_gain = team2_change
        
        print(f"TRADE WINNER: {winner_name} (+{winner_gain:.3f})")
        print(f"{team1.team_name}: {team1_change:+.3f}")
        print(f"{team2.team_name}: {team2_change:+.3f}")

        #need to return all the columns that changed for each team, like the diff
        # For each team, find all columns that changed and their diffs
        changed_cols = {}
        for idx, team in enumerate([team1, team2]):
            before = before_trade.iloc[idx]
            after = after_trade.iloc[idx]
            diffs = {}
            for col in before_trade.columns:
                if pd.api.types.is_numeric_dtype(before_trade[col]):
                    diff = float(after[col]) - float(before[col])
                    if diff != 0:
                        diffs[col] = round(float(diff), 3)
            changed_cols[team.team_name] = diffs
        changed_df = pd.DataFrame(changed_cols)
        return changed_df
    
    def recommend_free_agents(self, position=None, sort_by_score='composite_score'):
        team_df = self.league_comparisons[self.league_comparisons['team_name'] == self.team_name]
        fa_names = [free_agent.name for free_agent in self.free_agents]
        fas = self.all_players_stats[self.all_players_stats['name'].isin(fa_names)]
        fas = fas.sort_values(sort_by_score, ascending=False)


        if position:
            recs = fas[fas['position'] == position]

        else:
            position_mapping = {
                'starting_qbs_score_tier': 'QB',
                'starting_rb_score_tier': 'RB', 
                'starting_wr_score_tier': 'WR',
                'starting_te_score_tier': 'TE',
                'bench_qbs_score_tier': 'QB',
                'bench_rb_score_tier': 'RB',
                'bench_wr_score_tier': 'WR', 
                'bench_te_score_tier': 'TE'
            }
            
            team_row = team_df.iloc[0]

            positions_needed = [
                position_mapping[col]
                for col in position_mapping.keys()
                if col in team_row and team_row[col] in ['D', 'F']
            ]   
            print(positions_needed) 
            for position in positions_needed:
                recs = fas[fas['position'].isin(positions_needed)]



        return recs  
    


if __name__ == "__main__":
    league = LeagueMetrics(league_id=600021088, year=2025, team_name='FC Skanda', team_id=1)
    # print(league.recommend_free_agents(position='RB', sort_by_score='composite_score'))

    ch = league.evaluate_trade(league.league.teams[0], league.league.teams[1], [ 'Omarion Hampton', 'Malik Nabers', 'Drake Maye'], ['Kenneth Walker III'])
    print(ch)
