import type { ApiErrorCode, MetaResponse, OptimizeResponse } from '../types/api'
import { ApiError } from '../types/api'
import { mockMeta, mockOptimizeResponse } from './mock'

const isMockMode = import.meta.env.VITE_USE_MOCK === 'true'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function fetchMeta(): Promise<MetaResponse> {
  if (isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return mockMeta
  }

  const response = await fetch(`${API_BASE_URL}/api/meta`)
  if (!response.ok) {
    throw new ApiError('NETWORK', 'Unable to load portfolio metadata.')
  }

  return response.json()
}

export async function optimizePortfolio(payload: Record<string, unknown>): Promise<OptimizeResponse> {
  if (isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return {
      ...mockOptimizeResponse,
      model: payload.model as OptimizeResponse['model'],
      period: {
        ...mockOptimizeResponse.period,
        start: String(payload.start_date ?? mockOptimizeResponse.period.start),
        end: String(payload.end_date ?? mockOptimizeResponse.period.end),
      },
    }
  }

  const response = await fetch(`${API_BASE_URL}/api/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const code = (errorBody?.detail?.code as ApiErrorCode) || 'NETWORK'
    const message = errorBody?.detail?.message || 'The optimizer could not complete this request.'
    throw new ApiError(code, message)
  }

  return response.json()
}
