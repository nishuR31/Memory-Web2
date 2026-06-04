import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useState } from 'react';

interface EfficiencyPoint {
  pipeline: string;
  efficiency: number;
}

interface EfficiencyChartProps {
  data: EfficiencyPoint[];
}

interface ChartTokens {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  bar: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readChartTokens(): ChartTokens {
  return {
    grid: cssVar('--gp-chart-grid', '#153222'),
    axis: cssVar('--gp-chart-axis', '#0f5132'),
    tooltipBg: cssVar('--gp-chart-tooltip-bg', '#04110b'),
    tooltipBorder: cssVar('--gp-chart-tooltip-border', '#14532d'),
    tooltipText: cssVar('--gp-chart-tooltip-text', '#d1fae5'),
    bar: cssVar('--gp-chart-bar', '#22c55e'),
  };
}

export default function EfficiencyChart({ data }: EfficiencyChartProps) {
  const [tokens, setTokens] = useState<ChartTokens>(() => readChartTokens());

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTokens(readChartTokens());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
        <XAxis dataKey="pipeline" stroke={tokens.axis} fontSize={11} />
        <YAxis stroke={tokens.axis} fontSize={11} domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            backgroundColor: tokens.tooltipBg,
            border: `1px solid ${tokens.tooltipBorder}`,
            borderRadius: 10,
            color: tokens.tooltipText,
          }}
        />
        <Bar dataKey="efficiency" fill={tokens.bar} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
