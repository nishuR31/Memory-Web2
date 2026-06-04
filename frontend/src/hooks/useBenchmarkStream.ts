import { useCallback, useMemo, useState } from 'react';
import type { EvaluationResult, PipelineResult, StreamEvent, SummaryResult } from '../types/benchmark';
import { parseSseEvents } from '../utils/sse';

interface RunBenchmarkInput {
  query: string;
  groundTruth: string;
  model?: string;
}

interface UseBenchmarkStreamOptions {
  apiUrl: string;
}

export function useBenchmarkStream({ apiUrl }: UseBenchmarkStreamOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [results, setResults] = useState<Record<string, PipelineResult>>({});
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationResult>>({});
  const [summary, setSummary] = useState<SummaryResult | null>(null);

  const reset = useCallback(() => {
    setResults({});
    setEvaluations({});
    setSummary(null);
    setErrorMessage('');
  }, []);

  const runBenchmark = useCallback(
    async ({ query, groundTruth, model }: RunBenchmarkInput) => {
      setIsRunning(true);
      setErrorMessage('');
      setResults({});
      setEvaluations({});
      setSummary(null);

      try {
        const response = await fetch(`${apiUrl}/benchmark/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            ground_truth: groundTruth,
            model,
          }),
        });

        if (!response.ok) {
          throw new Error(`Benchmark request failed with status ${response.status}`);
        }
        if (!response.body) {
          throw new Error('No response stream received from backend');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseEvents(buffer);
          buffer = parsed.nextBuffer;

          for (const raw of parsed.events) {
            try {
              const data = JSON.parse(raw) as StreamEvent;

              if ('type' in data && data.type === 'evaluation') {
                setEvaluations((prev) => ({ ...prev, [data.pipeline]: data }));
              } else if ('type' in data && data.type === 'summary') {
                setSummary(data);
              } else {
                const result = data as PipelineResult;
                setResults((prev) => ({ ...prev, [result.pipeline]: result }));
              }
            } catch (error) {
              console.error('Failed to parse SSE event', { raw, error });
            }
          }
        }
      } catch (error) {
        setErrorMessage('Benchmark run failed. Check backend logs and API key configuration.');
        console.error('Failed to run benchmark', error);
      } finally {
        setIsRunning(false);
      }
    },
    [apiUrl]
  );

  return useMemo(
    () => ({
      isRunning,
      errorMessage,
      results,
      evaluations,
      summary,
      runBenchmark,
      reset,
      setErrorMessage,
    }),
    [errorMessage, evaluations, isRunning, reset, results, runBenchmark, summary]
  );
}
