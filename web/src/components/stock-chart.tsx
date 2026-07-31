import { useEffect, useRef } from 'react';
import {
  createChart,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Ausserboerslich, Candle, ChartData } from '@/lib/api';
import { fmtNum, fmtPct } from '@/lib/format';

/**
 * TradingView-artiger Kurs-Chart — 1:1-Portierung des v1-Verhaltens:
 * Candles + Volumen + SMA 50/200, Intraday-Zeitachse, OHLC-Overlay mit
 * Titelzeile, Preislinien (Vortag gepunktet, Vor-/Nachbörslich gestrichelt)
 * und Mausrad-Zoom ÜBER der Preisachse (autoscaleInfoProvider + Faktor,
 * Doppelklick auf die Achse = Reset) — das kann die Bibliothek nicht nativ.
 */
export function StockChart({
  data,
  titelZeile,
  vortag,
  ausserboerslich,
}: {
  data: ChartData;
  titelZeile: string;
  vortag: number | null;
  ausserboerslich: Ausserboerslich | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const sma50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const sma200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const priceZoomRef = useRef(1);
  const linesRef = useRef<IPriceLine[]>([]);
  const lastBarRef = useRef<Candle | null>(null);
  const symRef = useRef<HTMLDivElement>(null);
  const ohlcRef = useRef<HTMLDivElement>(null);

  // OHLC-Zeile direkt ins DOM schreiben (kein React-Rerender pro Mausbewegung)
  const setOhlc = (bar: Candle | null, vol: number | null | undefined) => {
    const node = ohlcRef.current;
    if (!node) return;
    if (!bar) {
      node.textContent = '';
      return;
    }
    const up = bar.close >= bar.open;
    const chg = bar.open ? ((bar.close - bar.open) / bar.open) * 100 : null;
    const farbe = up ? 'var(--color-up)' : 'var(--color-down)';
    const volText =
      vol == null
        ? '–'
        : vol >= 1e9
          ? `${(vol / 1e9).toFixed(2).replace('.', ',')} Mrd.`
          : vol >= 1e6
            ? `${(vol / 1e6).toFixed(2).replace('.', ',')} Mio.`
            : new Intl.NumberFormat('de-DE').format(vol);
    node.innerHTML = '';
    const teil = (label: string, wert: string, color?: string) => {
      const s = document.createElement('span');
      s.textContent = `${label} `;
      const b = document.createElement('b');
      b.textContent = wert;
      b.style.fontWeight = '500';
      if (color) b.style.color = color;
      s.append(b);
      node.append(s);
    };
    teil('O', fmtNum(bar.open), farbe);
    teil('H', fmtNum(bar.high), farbe);
    teil('T', fmtNum(bar.low), farbe);
    teil('S', fmtNum(bar.close), farbe);
    if (chg != null) teil('', fmtPct(chg), farbe);
    teil('Vol', volText, 'var(--color-ink2)');
  };

  // Chart einmalig erzeugen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#8592a8',
        fontFamily: "'Red Hat Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(42, 51, 70, 0.6)' },
        horzLines: { color: 'rgba(42, 51, 70, 0.6)' },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#2a3346' },
      timeScale: { borderColor: '#2a3346' },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: true,
      },
      autoSize: true,
      localization: { locale: 'de-DE' },
    });

    const candle = chart.addCandlestickSeries({
      upColor: '#35d99a',
      downColor: '#ff6b78',
      wickUpColor: '#35d99a',
      wickDownColor: '#ff6b78',
      borderVisible: false,
    });
    const volume = chart.addHistogramSeries({
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    const sma50 = chart.addLineSeries({
      color: '#e5a83b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const sma200 = chart.addLineSeries({
      color: '#9085e9',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Preisachsen-Zoom: Autoscale-Spanne um die Mitte strecken/stauchen
    candle.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const res = original();
        if (!res?.priceRange || priceZoomRef.current === 1) return res;
        const mitte = (res.priceRange.minValue + res.priceRange.maxValue) / 2;
        const halb = ((res.priceRange.maxValue - res.priceRange.minValue) / 2) * priceZoomRef.current;
        return { ...res, priceRange: { minValue: mitte - halb, maxValue: mitte + halb } };
      },
    });
    const ueberPreisachse = (e: MouseEvent) => {
      const x = e.clientX - container.getBoundingClientRect().left;
      return x >= container.clientWidth - chart.priceScale('right').width();
    };
    const onWheel = (e: WheelEvent) => {
      if (!ueberPreisachse(e)) return;
      e.preventDefault();
      e.stopPropagation();
      priceZoomRef.current = Math.min(
        Math.max(priceZoomRef.current * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 0.15),
        15
      );
      chart.priceScale('right').applyOptions({ autoScale: true });
    };
    const onDblClick = (e: MouseEvent) => {
      if (!ueberPreisachse(e)) return;
      priceZoomRef.current = 1;
      chart.priceScale('right').applyOptions({ autoScale: true });
    };
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    container.addEventListener('dblclick', onDblClick, true);

    chart.subscribeCrosshairMove((param) => {
      const bar = param?.seriesData?.get(candle) as Candle | undefined;
      if (!param?.time || !bar) {
        setOhlc(lastBarRef.current, lastBarRef.current?.volume);
        return;
      }
      const vol = (param.seriesData.get(volume) as { value?: number } | undefined)?.value;
      setOhlc(bar, vol ?? null);
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;
    sma50Ref.current = sma50;
    sma200Ref.current = sma200;

    return () => {
      container.removeEventListener('wheel', onWheel, true);
      container.removeEventListener('dblclick', onDblClick, true);
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Daten anwenden (Symbol- oder Zeitraumwechsel)
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    const volume = volumeRef.current;
    if (!chart || !candle || !volume) return;

    candle.setData(
      data.candles.map((c) => ({ ...c, time: c.time as unknown as UTCTimestamp }))
    );
    volume.setData(
      data.candles.map((c) => ({
        time: c.time as unknown as UTCTimestamp,
        value: c.volume ?? 0,
        color: c.close >= c.open ? 'rgba(53, 217, 154, 0.3)' : 'rgba(255, 107, 120, 0.3)',
      }))
    );
    sma50Ref.current?.setData(data.sma50.map((p) => ({ ...p, time: p.time as unknown as UTCTimestamp })));
    sma200Ref.current?.setData(data.sma200.map((p) => ({ ...p, time: p.time as unknown as UTCTimestamp })));
    chart.timeScale().applyOptions({ timeVisible: !!data.intraday, secondsVisible: false });
    priceZoomRef.current = 1;
    chart.timeScale().fitContent();

    lastBarRef.current = data.candles[data.candles.length - 1] ?? null;
    setOhlc(lastBarRef.current, lastBarRef.current?.volume);
  }, [data]);

  // Titelzeile + Preislinien
  useEffect(() => {
    if (symRef.current) symRef.current.textContent = titelZeile;
  }, [titelZeile]);

  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    linesRef.current.forEach((l) => candle.removePriceLine(l));
    linesRef.current = [];
    if (vortag != null) {
      linesRef.current.push(
        candle.createPriceLine({
          price: vortag,
          color: '#8592a8',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Vortag',
        })
      );
    }
    if (ausserboerslich?.preis != null) {
      linesRef.current.push(
        candle.createPriceLine({
          price: ausserboerslich.preis,
          color: '#e5a83b',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: ausserboerslich.phase === 'pre' ? 'Vorbörslich' : 'Nachbörslich',
        })
      );
    }
  }, [vortag, ausserboerslich, data]);

  return (
    <div ref={containerRef} className="relative h-[400px] w-full">
      <div className="pointer-events-none absolute left-2.5 top-2 z-10 rounded-md bg-[rgba(23,29,43,0.82)] px-2.5 py-1.5 backdrop-blur-sm">
        <div ref={symRef} className="text-[12px] font-semibold text-ink" />
        <div ref={ohlcRef} className="flex gap-2.5 font-mono text-[11px] text-ink3 tnum" />
      </div>
    </div>
  );
}
