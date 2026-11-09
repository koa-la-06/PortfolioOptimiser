import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { BarChart3, Download, Info, Minus, Moon, Plus, RefreshCcw, Search, Sun } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useForm } from 'react-hook-form'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useMeta, useOptimize } from './api/queries'
import { CHART_PALETTE, DEFAULT_BROKERAGE_FEE, DEFAULT_MAX_STOCKS, DEFAULT_TARGET_RETURN, MIN_WINDOW_DAYS } from './lib/constants'
import { formatDate, formatPercent, formatWeight, getEstimatedTradingDays, getWindowDays } from './lib/format'
import { toApiRequest } from './lib/toApiRequest'
import { optimizeFormSchema, type OptimizeFormValues } from './schemas/optimizeForm'
import type { ApiErrorCode, MetaResponse, OptimizeResponse } from './types/api'
import { ApiError } from './types/api'
import type { OptimizeRequest } from './types/api'

const getDefaultDateRange = (meta: MetaResponse) => {
  const to = new Date(`${meta.max_date}T00:00:00`)
  const from = new Date(to)
  from.setFullYear(to.getFullYear() - 5)
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: meta.max_date,
  }
}

const getPresetRanges = (meta: MetaResponse) => {
  const end = new Date(`${meta.max_date}T00:00:00`)
  const ranges = [
    { label: '1Y', from: new Date(end), to: new Date(end) },
    { label: '3Y', from: new Date(end), to: new Date(end) },
    { label: '5Y', from: new Date(end), to: new Date(end) },
    { label: '10Y', from: new Date(end), to: new Date(end) },
    { label: 'All', from: new Date(`${meta.min_date}T00:00:00`), to: new Date(`${meta.max_date}T00:00:00`) },
  ]

  ranges[0].from.setFullYear(end.getFullYear() - 1)
  ranges[1].from.setFullYear(end.getFullYear() - 3)
  ranges[2].from.setFullYear(end.getFullYear() - 5)
  ranges[3].from.setFullYear(end.getFullYear() - 10)

  return ranges.map(({ label, from, to }) => ({
    label,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }))
}

const defaultFormState = (meta: MetaResponse): OptimizeFormValues => {
  const dates = getDefaultDateRange(meta)
  return {
    model: 'hard',
    fromDate: dates.fromDate,
    toDate: dates.toDate,
    targetReturn: DEFAULT_TARGET_RETURN,
    maxStocks: DEFAULT_MAX_STOCKS,
    sectors: meta.sectors.map((sector) => sector.name),
    brokerageFee: DEFAULT_BROKERAGE_FEE,
  }
}

const friendlyError = (code?: ApiErrorCode | null, message?: string) => {
  switch (code) {
    case 'INFEASIBLE':
      return 'No portfolio satisfies these constraints. Try lowering the target return, raising K, or selecting more sectors.'
    case 'INSUFFICIENT_DATA':
      return 'Not enough data in this date range. Try a longer period.'
    case 'NETWORK':
      return "Can't reach the server. Is the backend running?"
    default:
      return message || 'Something went wrong while optimising the portfolio.'
  }
}

const getTotalSelectedSectorStocks = (sectors: MetaResponse['sectors'], selected: string[]) =>
  sectors.filter((sector) => selected.includes(sector.name)).reduce((total, sector) => total + sector.stock_count, 0)

const formatModelName = (model: 'easy' | 'hard') => (model === 'easy' ? 'Easy (QP)' : 'Hard (MIQP)')

function App() {
  const { data: meta, isLoading: isMetaLoading } = useMeta()
  const optimizeMutation = useOptimize()
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [result, setResult] = useState<OptimizeResponse | null>(null)
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [chartMode, setChartMode] = useState<'stock' | 'sector'>('stock')
  const [sortKey, setSortKey] = useState<'ticker' | 'sector' | 'weight'>('weight')
  const [sortAsc, setSortAsc] = useState(false)
  const [lastRequest, setLastRequest] = useState<OptimizeRequest | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const form = useForm<OptimizeFormValues>({
    resolver: zodResolver(optimizeFormSchema(meta || { min_date: '1999-01-04', max_date: '2026-01-30' })),
    defaultValues: defaultFormState({ min_date: '1999-01-04', max_date: '2026-01-30', total_stocks: 49, sectors: [] }),
    mode: 'onChange',
  })

  const { watch, setValue, reset, trigger, formState } = form
  const selectedModel = watch('model')
  const selectedSectors = watch('sectors')
  const fromDate = watch('fromDate')
  const toDate = watch('toDate')

  useEffect(() => {
    if (!meta) return
    reset(defaultFormState(meta))
  }, [meta, reset])

  useEffect(() => {
    if (!meta) return
    const maxAllowed = getTotalSelectedSectorStocks(meta.sectors, selectedSectors)
    if (watch('maxStocks') > maxAllowed && maxAllowed > 0) {
      setValue('maxStocks', maxAllowed, { shouldValidate: true })
    }
    if (selectedSectors.length === 0) {
      setValue('maxStocks', 1, { shouldValidate: true })
    }
  }, [meta, selectedSectors, setValue, watch])

  useEffect(() => {
    if (meta) trigger()
  }, [fromDate, toDate, selectedSectors, selectedModel, trigger, meta])

  const presetRanges = useMemo(() => (meta ? getPresetRanges(meta) : []), [meta])
  const maxSectorCount = useMemo(() => (meta ? getTotalSelectedSectorStocks(meta.sectors, selectedSectors) : 0), [meta, selectedSectors])
  const activeRange = useMemo(
    () => presetRanges.find((range) => range.from === fromDate && range.to === toDate),
    [presetRanges, fromDate, toDate],
  )

  const validDateWindow = !!fromDate && !!toDate && fromDate < toDate && getWindowDays(fromDate, toDate) >= MIN_WINDOW_DAYS

  const onSubmit = (values: OptimizeFormValues) => {
    const payload = toApiRequest(values)
    setLastRequest(payload)
    setErrorCode(null)
    optimizeMutation.mutate(payload, {
      onSuccess: (data) => {
        setResult(data)
        setErrorCode(null)
      },
      onError: (error) => {
        const apiError = error instanceof ApiError ? error : new ApiError('NETWORK', 'Unable to contact the optimizer.')
        setErrorCode(apiError.code)
      },
    })
  }

  const handleReset = () => {
    if (!meta) return
    reset(defaultFormState(meta))
    setResult(null)
    setErrorCode(null)
  }

  const isFormDisabled = !meta || optimizeMutation.isPending || !formState.isValid || !selectedSectors.length

  const sortedAllocations = useMemo(() => {
    if (!result) return []
    const allocations = [...result.allocations].filter((item) => item.weight * 100 >= 0.01)
    return allocations.sort((a, b) => {
      if (sortKey === 'weight') {
        return sortAsc ? a.weight - b.weight : b.weight - a.weight
      }
      if (sortKey === 'ticker') {
        return sortAsc ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker)
      }
      return sortAsc ? a.sector.localeCompare(b.sector) : b.sector.localeCompare(a.sector)
    })
  }, [result, sortKey, sortAsc])

  const chartData = useMemo(() => {
    if (!result) return []
    const source = chartMode === 'stock' ? result.allocations : result.sector_weights
    const threshold = 0.02
    const items = source.filter((item) => item.weight > 0)
    const main: Array<{ name: string; value: number; color: string }> = []
    let otherTotal = 0

    items.forEach((item, index) => {
      const weight = item.weight
      const label = 'ticker' in item ? String(item.ticker) : String(item.sector)
      if (weight < threshold) {
        otherTotal += weight
        return
      }
      main.push({ name: label, value: weight, color: CHART_PALETTE[index % CHART_PALETTE.length] })
    })

    if (otherTotal > 0) {
      main.push({ name: 'Other', value: otherTotal, color: '#CBD5E1' })
    }

    return main
  }, [result, chartMode])

  const handleDownloadCsv = () => {
    if (!result) return
    const rows = result.allocations.map((item) => [item.ticker, item.sector, (item.weight * 100).toFixed(2)])
    const csvRows = [
      ['Ticker', 'Sector', 'Weight_%'],
      ...rows,
      [],
      ['Metric', 'Value'],
      ['Model', formatModelName(result.model)],
      ['Period', `${result.period.start} - ${result.period.end}`],
      ['Expected return', formatPercent(result.metrics.expected_return)],
      ['Volatility', formatPercent(result.metrics.volatility)],
      ['Sharpe ratio', String(result.metrics.sharpe_ratio)],
      ['Total fees', result.metrics.total_fees === null ? 'n/a' : formatPercent(result.metrics.total_fees)],
      ['Stocks held', String(result.metrics.num_stocks)],
      ['Target return', `${watch('targetReturn')}%`],
      ['K', String(watch('maxStocks'))],
      ['Sectors', watch('sectors').join('; ') || '—'],
      ['Brokerage fee', `${watch('brokerageFee')}%`],
    ]
    const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `portfolio_${result.model}_${result.period.start}_${result.period.end}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadPdf = () => {
    if (!result) return
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, 210, 297, 'F')
    doc.setFontSize(18)
    doc.text('Optimised portfolio', 14, 18)
    doc.setFontSize(10)
    doc.text(`Model: ${formatModelName(result.model)}`, 14, 28)
    doc.text(`Period: ${formatDate(result.period.start)} – ${formatDate(result.period.end)}`, 14, 34)
    doc.text(`Trading days: ${result.period.trading_days}`, 14, 40)
    doc.text(`Target return: ${watch('targetReturn')}%`, 110, 28)
    doc.text(`K: ${watch('maxStocks')}`, 110, 34)
    doc.text(`Fee: ${watch('brokerageFee')}%`, 110, 40)

    autoTable(doc, {
      startY: 48,
      head: [['Metric', 'Value']],
      body: [
        ['Expected return', formatPercent(result.metrics.expected_return)],
        ['Volatility', formatPercent(result.metrics.volatility)],
        ['Sharpe ratio', result.metrics.sharpe_ratio.toFixed(2)],
        ['Total fees', result.metrics.total_fees === null ? 'n/a' : formatPercent(result.metrics.total_fees)],
        ['Stocks held', String(result.metrics.num_stocks)],
      ],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    })

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 8 : 110,
      head: [['Stock', 'Sector', 'Weight (%)']],
      body: result.allocations.map((item) => [item.ticker, item.sector, (item.weight * 100).toFixed(2)]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    })

    doc.setFontSize(8)
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 285)
    doc.save(`portfolio_${result.model}_${result.period.start}_${result.period.end}.pdf`)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[1480px] px-4 pb-6 pt-6 md:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="text-lg font-semibold">Portfolio Optimizer</div>
          </div>
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition hover:border-indigo-500 hover:text-indigo-500"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-soft lg:sticky lg:top-4 lg:h-fit">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <div className="mb-3 flex rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1">
                  {(['easy', 'hard'] as const).map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => setValue('model', model, { shouldValidate: true })}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        selectedModel === model ? 'bg-indigo-500 text-white shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {model === 'easy' ? 'Easy (QP)' : 'Hard (MIQP)'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {selectedModel === 'easy'
                    ? 'Idealised model. No fees, no stock limit, any sector.'
                    : 'Realistic model. Limits stock count, restricts sectors, accounts for brokerage fees.'}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">Date range</label>
                {isMetaLoading ? (
                  <div className="space-y-2">
                    <div className="h-11 animate-pulse rounded-lg bg-[var(--bg)]" />
                    <div className="h-11 animate-pulse rounded-lg bg-[var(--bg)]" />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div>
                        <input
                          type="date"
                          min={meta?.min_date}
                          max={meta?.max_date}
                          {...form.register('fromDate')}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                        />
                        {formState.errors.fromDate && <p className="mt-1 text-xs text-red-500">{String(formState.errors.fromDate.message)}</p>}
                      </div>
                      <div>
                        <input
                          type="date"
                          min={meta?.min_date}
                          max={meta?.max_date}
                          {...form.register('toDate')}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                        />
                        {formState.errors.toDate && <p className="mt-1 text-xs text-red-500">{String(formState.errors.toDate.message)}</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {presetRanges.map(({ label, from, to }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            setValue('fromDate', from, { shouldValidate: true })
                            setValue('toDate', to, { shouldValidate: true })
                          }}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            activeRange?.label === label ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      {validDateWindow ? `≈ ${getEstimatedTradingDays(fromDate, toDate)} trading days` : 'Choose a valid date range.'}
                    </p>
                  </>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-[var(--text)]">Target annual return</label>
                  <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-500">{watch('targetReturn')}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.5}
                  value={watch('targetReturn')}
                  onChange={(event) => setValue('targetReturn', Number(event.target.value), { shouldValidate: true })}
                  className="h-2 w-full accent-indigo-500"
                />
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={watch('targetReturn')}
                    onChange={(event) => setValue('targetReturn', Number(event.target.value), { shouldValidate: true })}
                    className="w-24 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-[var(--muted)]">% per year</span>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">Minimum-risk portfolio that achieves at least this return.</p>
              </div>

              <div className={selectedModel === 'easy' ? 'opacity-60' : ''}>
                <label className="mb-2 block text-sm font-medium text-[var(--text)]">Max stocks in portfolio (K)</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={selectedModel === 'easy' || watch('maxStocks') <= 1}
                    onClick={() => setValue('maxStocks', Math.max(1, watch('maxStocks') - 1), { shouldValidate: true })}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, maxSectorCount)}
                    disabled={selectedModel === 'easy'}
                    value={watch('maxStocks')}
                    onChange={(event) => setValue('maxStocks', Math.max(1, Number(event.target.value) || 1), { shouldValidate: true })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-sm text-[var(--text)] outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={selectedModel === 'easy' || watch('maxStocks') >= Math.max(1, maxSectorCount)}
                    onClick={() => setValue('maxStocks', Math.min(Math.max(1, maxSectorCount), watch('maxStocks') + 1), { shouldValidate: true })}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {selectedModel === 'easy' && <p className="mt-2 text-xs text-[var(--muted)]">Only used in Hard mode</p>}
              </div>

              <div className={selectedModel === 'easy' ? 'opacity-60' : ''}>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-[var(--text)]">Sectors</label>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => setValue('sectors', meta?.sectors.map((sector) => sector.name) ?? [], { shouldValidate: true })} className="text-indigo-500">Select all</button>
                    <button type="button" onClick={() => setValue('sectors', [], { shouldValidate: true })} className="text-[var(--muted)]">Clear</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(meta?.sectors ?? []).map((sector) => {
                    const selected = selectedSectors.includes(sector.name)
                    return (
                      <button
                        key={sector.name}
                        type="button"
                        disabled={selectedModel === 'easy'}
                        onClick={() => {
                          const next = selected ? selectedSectors.filter((name) => name !== sector.name) : [...selectedSectors, sector.name]
                          setValue('sectors', next, { shouldValidate: true })
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          selected ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {sector.name} · {sector.stock_count}
                      </button>
                    )
                  })}
                </div>
                {formState.errors.sectors && <p className="mt-1 text-xs text-red-500">{String(formState.errors.sectors.message)}</p>}
              </div>

              <div className={selectedModel === 'easy' ? 'opacity-60' : ''}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-[var(--text)]">Brokerage fee (% per stock held)</label>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--muted)]">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.01}
                  disabled={selectedModel === 'easy'}
                  value={watch('brokerageFee')}
                  onChange={(event) => setValue('brokerageFee', Number(event.target.value), { shouldValidate: true })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="mt-2 text-xs text-[var(--muted)]">Cost charged for each stock you hold. More stocks means more fees.</p>
              </div>

              <div className="space-y-3 pt-1">
                <button
                  type="submit"
                  disabled={isFormDisabled}
                  className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-indigo-400"
                >
                  {optimizeMutation.isPending ? 'Optimising…' : 'Optimise portfolio'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] transition hover:border-indigo-500 hover:text-indigo-500"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Reset
                </button>
              </div>
            </form>
          </aside>

          <main className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-soft sm:p-5 lg:min-h-[700px]">
            {!result && !optimizeMutation.isPending && !errorCode && (
              <div className="flex h-full min-h-[500px] flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
                  <Search className="h-10 w-10" />
                </div>
                <p className="text-lg font-medium text-[var(--text)]">Choose your settings and run the optimiser to see your portfolio.</p>
              </div>
            )}

            {optimizeMutation.isPending && (
              <div className="space-y-4">
                <div className="h-8 w-48 animate-pulse rounded bg-[var(--bg)]" />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-xl bg-[var(--bg)]" />
                  ))}
                </div>
                <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                  <div className="h-64 animate-pulse rounded-xl bg-[var(--bg)]" />
                  <div className="h-64 animate-pulse rounded-xl bg-[var(--bg)]" />
                </div>
                <div className="h-72 animate-pulse rounded-xl bg-[var(--bg)]" />
              </div>
            )}

            {errorCode && !optimizeMutation.isPending && (
              <div className="flex h-full min-h-[500px] items-center justify-center">
                <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-red-50 p-5 text-left text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">
                  <h3 className="mb-2 text-lg font-semibold">Portfolio error</h3>
                  <p>{friendlyError(errorCode, optimizeMutation.error instanceof Error ? optimizeMutation.error.message : undefined)}</p>
                  <button
                    type="button"
                    onClick={() => lastRequest && optimizeMutation.mutate(lastRequest as never, { onSuccess: (data) => setResult(data), onError: (error) => setErrorCode((error as ApiError).code) })}
                    className="mt-4 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {result && !optimizeMutation.isPending && (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-semibold">Optimised portfolio</h2>
                      <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-500">{formatModelName(result.model)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Data: {formatDate(result.period.start)} – {formatDate(result.period.end)} · {result.period.trading_days} trading days
                    </p>
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => setDownloadMenuOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)]">
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    {downloadMenuOpen && (
                      <div className="absolute right-0 z-10 mt-2 w-32 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-soft">
                        <button type="button" onClick={handleDownloadCsv} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--bg)]">CSV</button>
                        <button type="button" onClick={handleDownloadPdf} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--bg)]">PDF</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {[
                    { label: 'Expected return (annual)', value: formatPercent(result.metrics.expected_return) },
                    { label: 'Volatility (annual risk)', value: formatPercent(result.metrics.volatility) },
                    { label: 'Sharpe ratio', value: result.metrics.sharpe_ratio.toFixed(2) },
                    { label: 'Total brokerage fees', value: result.metrics.total_fees === null ? 'n/a' : formatPercent(result.metrics.total_fees) },
                    { label: 'Stocks held', value: String(result.metrics.num_stocks) },
                  ].map((card) => (
                    <div key={card.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{card.label}</p>
                      <p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--text)]">{card.value}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{card.label === 'Stocks held' ? `of ${result.metrics.num_stocks} available` : card.label === 'Total brokerage fees' && result.metrics.total_fees === null ? 'Easy mode' : 'Portfolio summary'}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
                        {(['stock', 'sector'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setChartMode(mode)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium ${chartMode === mode ? 'bg-indigo-500 text-white' : 'text-[var(--muted)]'}`}
                          >
                            {mode === 'stock' ? 'By stock' : 'By sector'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={2} stroke="transparent">
                            {chartData.map((entry, index) => (
                              <Cell key={`${entry.name}-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => `${(Number(value ?? 0) * 100).toFixed(2)}%`}
                            contentStyle={{
                              backgroundColor: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '12px',
                              color: 'var(--text)',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium text-[var(--text)]">Breakdown</p>
                      <span className="text-xs text-[var(--muted)]">{chartMode === 'stock' ? `${result.metrics.num_stocks} stocks` : `${result.sector_weights.length} sectors`}</span>
                    </div>
                    <div className="space-y-3">
                      {chartData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-sm text-[var(--text)]">{item.name}</span>
                          </div>
                          <span className="text-sm tabular-nums text-[var(--muted)]">{(item.value * 100).toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead className="sticky top-0 bg-[var(--surface)] text-[var(--muted)]">
                        <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.12em]">
                          {(['ticker', 'sector', 'weight'] as const).map((column) => (
                            <th key={column} className="px-4 py-3 font-medium">
                              <button type="button" onClick={() => {
                                if (sortKey === column) {
                                  setSortAsc((current) => !current)
                                } else {
                                  setSortKey(column)
                                  setSortAsc(column === 'weight')
                                }
                              }} className="flex items-center gap-1">
                                {column === 'ticker' ? 'Stock (ticker)' : column === 'sector' ? 'Sector' : 'Weight (%)'}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAllocations.map((item, index) => (
                          <tr key={`${item.ticker}-${index}`} className="border-b border-[var(--border)] last:border-0">
                            <td className="px-4 py-3 text-sm font-medium text-[var(--text)]">{item.ticker}</td>
                            <td className="px-4 py-3 text-sm text-[var(--muted)]">{item.sector}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-2.5 w-28 rounded-full bg-[var(--surface)] ring-1 ring-inset ring-[var(--border)]">
                                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${item.weight * 100}%` }} />
                                </div>
                                <span className="w-14 text-right text-sm tabular-nums text-[var(--text)]">{(item.weight * 100).toFixed(2)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-[var(--surface)]">
                          <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-[var(--muted)]">Total {formatWeight(1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        <footer className="mt-6 flex items-center justify-center px-2 py-4 text-center text-xs text-[var(--muted)]">
          Constrained Portfolio Optimization · Sri Hansika Chitturi, Mahithi Kuppa, Geethika Grandhe
        </footer>
      </div>
    </div>
  )
}

export default App
