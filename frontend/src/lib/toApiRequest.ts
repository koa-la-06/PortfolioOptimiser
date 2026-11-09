import type { ModelType, OptimizeRequest } from '../types/api'

export interface FormValues {
  model: ModelType
  fromDate: string
  toDate: string
  targetReturn: number
  maxStocks: number
  sectors: string[]
  brokerageFee: number
}

export const toApiRequest = (values: FormValues): OptimizeRequest => {
  const payload: OptimizeRequest = {
    model: values.model,
    start_date: values.fromDate,
    end_date: values.toDate,
    target_return: values.targetReturn / 100,
  }

  if (values.model === 'hard') {
    payload.max_stocks = values.maxStocks
    payload.sectors = values.sectors
    payload.brokerage_fee = values.brokerageFee / 100
  }

  return payload
}
