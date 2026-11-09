export type ModelType = 'easy' | 'hard'

export interface MetaSector {
  name: string
  stock_count: number
}

export interface MetaResponse {
  min_date: string
  max_date: string
  total_stocks: number
  sectors: MetaSector[]
}

export interface OptimizeRequest {
  model: ModelType
  start_date: string
  end_date: string
  target_return: number
  max_stocks?: number
  sectors?: string[]
  brokerage_fee?: number
}

export interface Allocation {
  ticker: string
  sector: string
  weight: number
}

export interface SectorWeight {
  sector: string
  weight: number
}

export interface OptimizeMetrics {
  expected_return: number
  volatility: number
  sharpe_ratio: number
  total_fees: number | null
  num_stocks: number
  solver_status: string
  solve_time_ms: number
}

export interface OptimizeResponse {
  model: ModelType
  period: { start: string; end: string; trading_days: number }
  allocations: Allocation[]
  sector_weights: SectorWeight[]
  metrics: OptimizeMetrics
}

export type ApiErrorCode =
  | 'INFEASIBLE'
  | 'INSUFFICIENT_DATA'
  | 'INVALID_REQUEST'
  | 'SOLVER_ERROR'
  | 'NETWORK'

export interface ApiErrorDetail {
  code: ApiErrorCode
  message: string
}

export class ApiError extends Error {
  code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}
