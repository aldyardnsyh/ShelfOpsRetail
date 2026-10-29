"use client";

// Premium chart kit: wrapper recharts dengan tema mewah konsisten design
// system (gradient fill accent, grid halus, tooltip card mini, animasi
// ease-out yang menghormati prefers-reduced-motion).

import { useId, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useI18n } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/format";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

type ChartEntry = Record<string, unknown>;

const DURATION = 800;
const AXIS_TICK = { fontSize: 11, fill: "var(--color-muted-foreground)" };

export function ChartStatBadge({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-background/85 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur",
        className,
      )}
    >
      {label}
      <span className="tabular text-foreground">{value}</span>
    </span>
  );
}

export function PremiumTooltipContent({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: { value?: number | string; name?: string; color?: string }[];
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="pointer-events-none min-w-32 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-md backdrop-blur">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry, index) => (
          <li key={`${entry.name ?? index}-${index}`} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color ?? "var(--color-accent)" }}
            />
            {entry.name ? (
              <span className="text-muted-foreground">{entry.name}</span>
            ) : null}
            <span className="tabular ml-auto font-medium text-foreground">
              {valueFormatter
                ? valueFormatter(Number(entry.value))
                : String(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface StatsBadgesProps {
  data: ChartEntry[];
  yKey: string;
  valueFormatter: (value: number) => string;
}

function StatsBadges({ data, yKey, valueFormatter }: StatsBadgesProps) {
  const { t } = useI18n();
  const values = data
    .map((entry) => Number(entry[yKey]))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  const peak = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return (
    <div className="pointer-events-none absolute right-3 top-1 z-10 flex flex-wrap items-center gap-1.5">
      <ChartStatBadge label={t.chart.peak} value={valueFormatter(peak)} />
      <ChartStatBadge label={t.chart.average} value={valueFormatter(Math.round(avg * 10) / 10)} />
    </div>
  );
}

interface ChartSummaryProps {
  data: ChartEntry[];
  xKey: string;
  yKeys: string[];
  valueFormatter: (value: number) => string;
}

function ChartSummary({ data, xKey, yKeys, valueFormatter }: ChartSummaryProps) {
  return (
    <div className="sr-only">
      <ul>
        {data.map((entry, index) => (
          <li key={index}>
            {String(entry[xKey])}:{" "}
            {yKeys
              .map((yKey) => valueFormatter(Number(entry[yKey])))
              .join(", ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface PremiumAreaChartProps {
  data: ChartEntry[];
  xKey: string;
  yKey: string;
  seriesName?: string;
  height?: number;
  color?: string;
  strokeWidth?: number;
  valueFormatter?: (value: number) => string;
  xTickFormatter?: (value: string, index: number) => string;
  yTickFormatter?: (value: number) => string;
  ariaLabel: string;
  showStats?: boolean;
  showSummary?: boolean;
  className?: string;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  yAxisWidth?: number;
  children?: ReactNode;
}

export function PremiumAreaChart({
  data,
  xKey,
  yKey,
  seriesName,
  height = 260,
  color = "var(--color-accent)",
  strokeWidth = 2.2,
  valueFormatter,
  xTickFormatter,
  yTickFormatter,
  ariaLabel,
  showStats = true,
  showSummary = true,
  className,
  margin,
  yAxisWidth = 40,
  children,
}: PremiumAreaChartProps) {
  const { locale } = useI18n();
  const reduced = useReducedMotion();
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fmt = valueFormatter ?? ((value: number) => formatNumber(value, locale));

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("relative w-full", className)}
    >
      {showStats ? (
        <StatsBadges data={data} yKey={yKey} valueFormatter={fmt} />
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={margin ?? { top: 8, right: 8, left: -18, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={xTickFormatter}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              width={yAxisWidth}
              tickFormatter={yTickFormatter}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
              content={
                <PremiumTooltipContent valueFormatter={fmt} />
              }
            />
            <Area
              type="monotone"
              dataKey={yKey}
              name={seriesName}
              stroke={color}
              strokeWidth={strokeWidth}
              fill={`url(#${gradientId})`}
              activeDot={{
                r: 5,
                strokeWidth: 2,
                stroke: "var(--color-background)",
              }}
              isAnimationActive={!reduced}
              animationDuration={DURATION}
              animationEasing="ease-out"
            />
            {children}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {showSummary ? (
        <ChartSummary data={data} xKey={xKey} yKeys={[yKey]} valueFormatter={fmt} />
      ) : null}
    </div>
  );
}

export interface PremiumBarChartProps {
  data: ChartEntry[];
  xKey: string;
  yKeys: string[];
  seriesNames?: string[];
  colors?: string[];
  height?: number;
  layout?: "horizontal" | "vertical";
  valueFormatter?: (value: number) => string;
  xTickFormatter?: (value: string, index: number) => string;
  yTickFormatter?: (value: number) => string;
  ariaLabel: string;
  showStats?: boolean;
  showSummary?: boolean;
  className?: string;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  axisWidth?: number;
  barColor?: string | ((entry: ChartEntry, index: number) => string);
  children?: ReactNode;
  xAxisOverrides?: Record<string, unknown>;
  yAxisOverrides?: Record<string, unknown>;
}

export function PremiumBarChart({
  data,
  xKey,
  yKeys,
  seriesNames,
  colors,
  height = 260,
  layout = "horizontal",
  valueFormatter,
  xTickFormatter,
  yTickFormatter,
  ariaLabel,
  showStats = true,
  showSummary = true,
  className,
  margin,
  axisWidth = 40,
  barColor,
  children,
  xAxisOverrides,
  yAxisOverrides,
}: PremiumBarChartProps) {
  const { locale } = useI18n();
  const reduced = useReducedMotion();
  const fmt = valueFormatter ?? ((value: number) => formatNumber(value, locale));
  const vertical = layout === "vertical";
  const seriesLabels = seriesNames ?? yKeys;
  const multipleSeries = yKeys.length > 1;

  const categoryAxis = {
    dataKey: xKey,
    tickLine: false,
    axisLine: false,
    tick: vertical
      ? { fontSize: 11, fill: "var(--color-foreground)" }
      : AXIS_TICK,
    tickFormatter: vertical ? undefined : xTickFormatter,
  };
  const valueAxis = {
    type: "number" as const,
    tickLine: false,
    axisLine: false,
    tick: AXIS_TICK,
    tickFormatter: vertical ? yTickFormatter : undefined,
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("relative w-full", className)}
    >
      {showStats ? (
        <StatsBadges data={data} yKey={yKeys[0]!} valueFormatter={fmt} />
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout={layout}
            margin={margin ?? { top: 8, right: 8, left: -18, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={vertical}
              horizontal={!vertical}
            />
            {vertical ? (
              <>
                <XAxis {...valueAxis} {...xAxisOverrides} />
                <YAxis
                  {...categoryAxis}
                  width={axisWidth}
                  {...yAxisOverrides}
                />
              </>
            ) : (
              <>
                <XAxis {...categoryAxis} {...xAxisOverrides} />
                <YAxis
                  {...valueAxis}
                  width={axisWidth}
                  {...yAxisOverrides}
                  tickFormatter={yTickFormatter}
                />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
              content={<PremiumTooltipContent valueFormatter={fmt} />}
            />
            {yKeys.map((yKey, seriesIndex) => {
              const seriesColor =
                colors?.[seriesIndex] ??
                ["var(--color-accent)", "var(--color-warning)", "var(--color-success)", "var(--color-danger)"][
                  seriesIndex % 4
                ]!;
              return (
                <Bar
                  key={yKey}
                  dataKey={yKey}
                  name={seriesLabels[seriesIndex]}
                  fill={typeof barColor === "string" ? barColor : seriesColor}
                  radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
                  isAnimationActive={!reduced}
                  animationDuration={DURATION}
                  animationEasing="ease-out"
                  animationBegin={seriesIndex * 120}
                >
                  {typeof barColor === "function"
                    ? data.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={barColor(entry, index)}
                        />
                      ))
                    : null}
                  {children}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {multipleSeries ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {seriesLabels.map((label, index) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{
                  backgroundColor:
                    colors?.[index] ?? "var(--color-accent)",
                }}
              />
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {showSummary ? (
        <ChartSummary
          data={data}
          xKey={xKey}
          yKeys={yKeys}
          valueFormatter={fmt}
        />
      ) : null}
    </div>
  );
}
