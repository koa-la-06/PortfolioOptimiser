import pandas as pd
import numpy as np
import cvxpy as cp

def load_data(csv_path='nifty50_historical_data.csv'):
    """Loads raw Nifty 50 historical data."""
    df = pd.read_csv(csv_path)
    return df[['Date', 'Ticker', 'Daily_Return', 'Sector']]

def solve_single_optimization(returns_df, base_constraints, objective, w, risk_free_rate, manual_target_return):
    """Helper solver function that runs the Sharpe scan or manual target solve."""
    target_to_use = manual_target_return
    best_sharpe = None

    if manual_target_return is None:
        test_targets = np.linspace(0.10, 0.30, 21)
        best_sharpe = -1
        target_to_use = 0

        for target in test_targets:
            constraints = base_constraints + [returns_df.mean().values * 252 @ w >= target]
            prob = cp.Problem(objective, constraints)
            try:
                # Force CPLEX solver for both QP and MIQP
                prob.solve(solver=cp.CPLEX, verbose=False)
                if prob.status == 'optimal':
                    volatility = np.sqrt(prob.value * 2)
                    sharpe = (target - risk_free_rate) / volatility
                    if sharpe > best_sharpe:
                        best_sharpe = sharpe
                        target_to_use = target
            except:
                pass

        if target_to_use == 0:
            return {"status": "error", "message": "Infeasible target selection."}

    final_constraints = base_constraints + [returns_df.mean().values * 252 @ w >= target_to_use]
    final_problem = cp.Problem(objective, final_constraints)

    try:
        final_problem.solve(solver=cp.CPLEX, verbose=False)
    except cp.error.SolverError:
        return {"status": "error", "message": "Solver Error. CPLEX is required."}

    if final_problem.status == 'optimal':
        chosen_stocks = {}
        for ticker, weight in zip(returns_df.columns, w.value):
            if weight > 0.0001:
                chosen_stocks[ticker] = float(round(weight * 100, 2))

        return {
            "status": "success",
            "type": "Auto-Sharpe" if manual_target_return is None else "Manual",
            "target_return_used": float(round(target_to_use * 100, 2)),
            "max_sharpe_ratio": float(round(best_sharpe, 4)) if best_sharpe is not None and best_sharpe != -1 else "N/A",
            "risk_variance": float(round(final_problem.value * 2, 5)),
            "portfolio": chosen_stocks
        }
    else:
        return {"status": "error", "message": f"Infeasible at {target_to_use*100}% return."}

def generate_portfolio(df, current_date, window_years, K, allowed_sectors, manual_target_return=None, mode="both"):
    """
    Quantitative Portfolio Optimization Engine.
    Supports mode="easy" (Unconstrained QP), mode="hard" (MIQP with K & Sectors), 
    or mode="both" (returns both for comparison on frontend).
    """
    risk_free_rate = 0.07

    # 1. TIME TRAVEL: Slice dataset based on requested date window
    end_date_dt = pd.to_datetime(current_date)
    start_date_dt = end_date_dt - pd.DateOffset(years=window_years)

    df_dates = pd.to_datetime(df['Date']).dt.tz_localize(None)
    mask = (df_dates >= start_date_dt) & (df_dates <= end_date_dt)
    training_df = df.loc[mask]

    if training_df.empty:
        return {"status": "error", "message": "No data available for this date range."}

    sector_map = dict(zip(training_df['Ticker'], training_df['Sector']))
    returns_df = training_df.pivot(index='Date', columns='Ticker', values='Daily_Return').dropna()

    mu = returns_df.mean() * 252
    Sigma = returns_df.cov() * 252
    N = len(mu)

    response = {"status": "success"}

    # 2. EASY VERSION (Continuous QP - No K, No Sector restrictions)
    if mode in ["easy", "both"]:
        w_easy = cp.Variable(N)
        risk_easy = cp.quad_form(w_easy, Sigma.values)
        obj_easy = cp.Minimize(0.5 * risk_easy)
        base_constraints_easy = [cp.sum(w_easy) == 1, w_easy >= 0]
        
        easy_result = solve_single_optimization(
            returns_df, base_constraints_easy, obj_easy, w_easy, risk_free_rate, manual_target_return
        )
        response["easy_version"] = easy_result

    # 3. HARD VERSION (MIQP - Enforces K stocks max & Allowed Sectors)
    if mode in ["hard", "both"]:
        w_hard = cp.Variable(N)
        y_hard = cp.Variable(N, boolean=True)
        risk_hard = cp.quad_form(w_hard, Sigma.values)
        obj_hard = cp.Minimize(0.5 * risk_hard)

        base_constraints_hard = [
            cp.sum(w_hard) == 1,
            w_hard >= 0,
            w_hard <= y_hard,
            cp.sum(y_hard) <= K
        ]

        for idx, ticker in enumerate(returns_df.columns):
            stock_sector = sector_map.get(ticker, '')
            if stock_sector not in allowed_sectors:
                base_constraints_hard.append(y_hard[idx] == 0)

        hard_result = solve_single_optimization(
            returns_df, base_constraints_hard, obj_hard, w_hard, risk_free_rate, manual_target_return
        )
        response["hard_version"] = hard_result

    return response