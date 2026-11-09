export const formatPercent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`

export const formatDecimal = (value: number, digits = 2) => value.toFixed(digits)

export const formatWeight = (value: number) => `${(value * 100).toFixed(2)}%`

export const formatNumber = (value: number, digits = 0) => value.toLocaleString(undefined, {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
})

export const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatApiDate = (value: string) => value

export const getWindowDays = (from: string, to: string) => {
  const start = new Date(`${from}T00:00:00`).getTime()
  const end = new Date(`${to}T00:00:00`).getTime()
  return Math.max(0, Math.round((end - start) / 86400000) + 1)
}

export const getEstimatedTradingDays = (from: string, to: string) => {
  const calendarDays = getWindowDays(from, to)
  return Math.round((calendarDays * 252) / 365)
}
