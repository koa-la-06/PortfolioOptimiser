import type { MetaResponse, OptimizeResponse } from '../types/api'

export const mockMeta: MetaResponse = {
  min_date: '1999-01-04',
  max_date: '2026-01-30',
  total_stocks: 49,
  sectors: [
    { name: 'IT', stock_count: 8 },
    { name: 'Banking', stock_count: 9 },
    { name: 'Pharma', stock_count: 10 },
    { name: 'FMCG', stock_count: 9 },
    { name: 'Energy', stock_count: 13 },
  ],
}

export const mockOptimizeResponse: OptimizeResponse = {
  model: 'hard',
  period: { start: '2019-01-01', end: '2024-01-01', trading_days: 1235 },
  allocations: [
    { ticker: 'TCS', sector: 'IT', weight: 0.18 },
    { ticker: 'HDFCBANK', sector: 'Banking', weight: 0.15 },
    { ticker: 'SUNPHARMA', sector: 'Pharma', weight: 0.13 },
    { ticker: 'RELIANCE', sector: 'Energy', weight: 0.12 },
    { ticker: 'ITC', sector: 'FMCG', weight: 0.11 },
    { ticker: 'INFY', sector: 'IT', weight: 0.09 },
    { ticker: 'ICICIBANK', sector: 'Banking', weight: 0.08 },
    { ticker: 'LTIM', sector: 'IT', weight: 0.07 },
    { ticker: 'DRREDDY', sector: 'Pharma', weight: 0.07 },
  ],
  sector_weights: [
    { sector: 'IT', weight: 0.34 },
    { sector: 'Banking', weight: 0.23 },
    { sector: 'Pharma', weight: 0.2 },
    { sector: 'Energy', weight: 0.12 },
    { sector: 'FMCG', weight: 0.11 },
  ],
  metrics: {
    expected_return: 0.1243,
    volatility: 0.1502,
    sharpe_ratio: 0.83,
    total_fees: 0.008,
    num_stocks: 9,
    solver_status: 'optimal',
    solve_time_ms: 1840,
  },
}
