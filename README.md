## https://ff-copilot.vercel.app/

Evaluate Player Metric
        
        1. Production Score (50% weight)
        - What: Position-relative fantasy performance ranking
        - Calculation: (total_players_at_position - player_rank + 1) / total_players_at_position
        - Data source: projected_total_points compared to same position players
        - Example: RB ranked 3rd out of 50 RBs = (50-3+1)/50 = 0.96
        - Higher = Better projected points vs position peers
        
        2. Reliability Score (30% weight)
        - What: Player dependability based on health + market confidence
        - Components:
            * Injury Status (60%): ACTIVE=1.0, QUESTIONABLE=0.7, DOUBTFUL=0.4, OUT=0.2, IR=0.1
            * Market Confidence (40%): (percent_owned + percent_started) / 200
        - Calculation: (injury_score * 0.6) + (market_confidence * 0.4)
        - Logic: Healthy players + high ownership/start rates = more reliable
        - Higher = Better health + more market trust
        
        3. Sentiment Score (10% weight)
        - What: Expert and community opinion analysis
        - Data source: Scraped sentiment from Reddit/FantasyPros/ESPN (overall_sentiment_score)
        - Calculation: sentiment_value / 10 (converts 1-10 scale to 0-1)
        - Default: 0.5 if no sentiment data available
        - Higher = More positive expert/community sentiment
        
        4. Value Score (10% weight)
        - What: Fantasy efficiency - points per ownership percentage
        - Calculation: projected_total_points / (percent_owned + 1) ranked within position
        - Same percentile formula as production score
        - Logic: High projected points + low ownership = great value
        - Higher = More "bang for your buck" vs position peers
        
        5. Composite Score (Final Rating)
        - Formula: (Production×0.5) + (Reliability×0.3) + (Sentiment×0.1) + (Value×0.1)
        - Range: 0-1 scale where 1.0 = perfect score
        - Interpretation: Overall player quality considering performance, health, opinion, and value
        
        
