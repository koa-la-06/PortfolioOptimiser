import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchMeta, optimizePortfolio } from './client'
import type { MetaResponse, OptimizeRequest, OptimizeResponse } from '../types/api'

export const useMeta = () =>
  useQuery<MetaResponse>({
    queryKey: ['meta'],
    queryFn: fetchMeta,
  })

export const useOptimize = () =>
  useMutation<OptimizeResponse, Error, OptimizeRequest>({
    mutationFn: async (payload) => optimizePortfolio(payload as unknown as Record<string, unknown>),
  })
