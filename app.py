from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from portfolio_engine import load_data, generate_portfolio

app = FastAPI()

# Enable CORS so your friend's frontend can communicate with your backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load historical data once when the server boots up
df_global = load_data('nifty50_historical_data.csv')

# Define the input schema expected from the frontend
class PortfolioRequest(BaseModel):
    current_date: str
    window_years: int
    K: int
    allowed_sectors: List[str]
    manual_target_return: Optional[float] = None
    mode: Optional[str] = "both"  # Accepts "easy", "hard", or "both"

@app.post("/api/optimize")
def optimize_endpoint(req: PortfolioRequest):
    return generate_portfolio(
        df=df_global,
        current_date=req.current_date,
        window_years=req.window_years,
        K=req.K,
        allowed_sectors=req.allowed_sectors,
        manual_target_return=req.manual_target_return,
        mode=req.mode
    )