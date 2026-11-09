import { z } from 'zod'
import { MIN_WINDOW_DAYS } from '../lib/constants'

export const optimizeFormSchema = (meta: { min_date: string; max_date: string }) =>
  z.object({
    model: z.enum(['easy', 'hard']),
    fromDate: z.string().min(1, 'Select a start date.'),
    toDate: z.string().min(1, 'Select an end date.'),
    targetReturn: z.number().min(0).max(50),
    maxStocks: z.number().int().min(1),
    sectors: z.array(z.string()).min(1, 'Select at least one sector.'),
    brokerageFee: z.number().min(0).max(5),
  }).superRefine((data, ctx) => {
    const min = new Date(`${meta.min_date}T00:00:00`).getTime()
    const max = new Date(`${meta.max_date}T00:00:00`).getTime()
    const from = new Date(`${data.fromDate}T00:00:00`).getTime()
    const to = new Date(`${data.toDate}T00:00:00`).getTime()

    if (Number.isNaN(from) || from < min || from > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromDate'], message: 'Start date must be within the available range.' })
    }

    if (Number.isNaN(to) || to < min || to > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'End date must be within the available range.' })
    }

    if (!Number.isNaN(from) && !Number.isNaN(to) && from >= to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromDate'], message: 'Start date must be before the end date.' })
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'Start date must be before the end date.' })
    }

    if (!Number.isNaN(from) && !Number.isNaN(to) && to - from < MIN_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fromDate'], message: `The date window must be at least ${MIN_WINDOW_DAYS} days.` })
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: `The date window must be at least ${MIN_WINDOW_DAYS} days.` })
    }
  })

export type OptimizeFormValues = z.infer<ReturnType<typeof optimizeFormSchema>>
