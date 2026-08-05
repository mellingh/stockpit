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
 * Candles + Volumen + SMA 50/200, Intraday-Zeitachse, transparentes
 * OHLC-Overlay, Preislinien (Vortag gepunktet, Vor-/Nachbörslich gestrichelt)
 * und Mausrad-Zoom ÜBER der Preisachse (autoscaleInfoProvider + Faktor,
 * Doppelklick auf die Achse = Reset) — das kann die Bibliothek nicht nativ.
 */
export function StockChart({
  data,
  vortag,
  ausserboerslich,
}: {
  data: ChartData;
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
  // Manuell verschobene Preisspanne (TradingView-Modus): gesetzt, sobald der
  // Nutzer vertikal zieht — ab dann gilt diese Spanne statt der Auto-Skalierung
  const priceFixRef = useRef<{ min: number; max: number } | null>(null);
  const dataLenRef = useRef(0);
  const linesRef = useRef<IPriceLine[]>([]);
  const lastBarRef = useRef<Candle | null>(null);
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
      timeScale: { borderColor: '#2a3346', minBarSpacing: 0.05 },
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

    // Preisachsen-Zoom + manuelle Preisspanne: die feste Spanne (nach vertikalem
    // Ziehen) gewinnt; sonst wird die Auto-Spanne um die Mitte gestreckt/gestaucht
    candle.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const fix = priceFixRef.current;
        if (fix) return { priceRange: { minValue: fix.min, maxValue: fix.max } };
        const res = original();
        if (!res?.priceRange || priceZoomRef.current === 1) return res;
        const mitte = (res.priceRange.minValue + res.priceRange.maxValue) / 2;
        const halb = ((res.priceRange.maxValue - res.priceRange.minValue) / 2) * priceZoomRef.current;
        return { ...res, priceRange: { minValue: mitte - halb, maxValue: mitte + halb } };
      },
    });
    // Die SMAs hängen an derselben Preisskala: sobald der Nutzer zoomt/verschiebt,
    // dürfen sie die Spanne nicht wieder aufweiten (Autoscale nimmt die Vereinigung)
    const smaProvider = (original: () => { priceRange: { minValue: number; maxValue: number } } | null) =>
      priceFixRef.current || priceZoomRef.current !== 1 ? null : original();
    sma50.applyOptions({ autoscaleInfoProvider: smaProvider });
    sma200.applyOptions({ autoscaleInfoProvider: smaProvider });

    const preisskalaNeu = () => chart.priceScale('right').applyOptions({ autoScale: true });
    const paneHoehe = () => container.clientHeight - chart.timeScale().height();
    const ueberPreisachse = (e: MouseEvent) => {
      const x = e.clientX - container.getBoundingClientRect().left;
      return x >= container.clientWidth - chart.priceScale('right').width();
    };
    const onWheel = (e: WheelEvent) => {
      if (!ueberPreisachse(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const faktor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      const fix = priceFixRef.current;
      if (fix) {
        const mitte = (fix.min + fix.max) / 2;
        const halb = ((fix.max - fix.min) / 2) * faktor;
        priceFixRef.current = { min: mitte - halb, max: mitte + halb };
      } else {
        // Weite Grenzen: bei 15x lief das Rad gegen die Wand und reagierte
        // nicht mehr — danach musste man per Drag weiter (Micha, Runde 23)
        priceZoomRef.current = Math.min(Math.max(priceZoomRef.current * faktor, 0.02), 80);
      }
      preisskalaNeu();
    };
    const onDblClick = (e: MouseEvent) => {
      if (!ueberPreisachse(e)) return;
      priceZoomRef.current = 1;
      priceFixRef.current = null;
      preisskalaNeu();
    };
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    container.addEventListener('dblclick', onDblClick, true);

    // Vertikales Verschieben (Micha, Runde 26): im gezoomten Chart ließ sich die
    // Ansicht nur seitlich bewegen. Wie bei TradingView löst ein vertikaler Zug
    // im Kerzenbereich die Auto-Skalierung und verschiebt die Preisspanne mit —
    // seitliches Ziehen allein lässt sie in Ruhe (5px-Schwelle).
    let panY: number | null = null;
    let panVertikal = 0;
    const onPointerDown = (e: PointerEvent) => {
      const imPane = e.clientY - container.getBoundingClientRect().top < paneHoehe();
      if (e.button !== 0 || ueberPreisachse(e) || !imPane) return;
      panY = e.clientY;
      panVertikal = 0;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (panY == null) return;
      const dy = e.clientY - panY;
      panY = e.clientY;
      panVertikal += Math.abs(dy);
      if (!priceFixRef.current) {
        if (panVertikal < 5) return;
        const oben = candle.coordinateToPrice(0);
        const unten = candle.coordinateToPrice(paneHoehe());
        if (oben == null || unten == null) return;
        priceFixRef.current = { min: unten as number, max: oben as number };
      }
      if (dy === 0) return;
      const fix = priceFixRef.current;
      const preisProPixel = (fix.max - fix.min) / paneHoehe();
      priceFixRef.current = { min: fix.min + dy * preisProPixel, max: fix.max + dy * preisProPixel };
      preisskalaNeu();
    };
    const onPointerUp = () => {
      panY = null;
    };
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Zoom-out-Klemme (Micha, Runde 25): ohne Grenze schrumpften die Kerzen beim
    // Rauszoomen zu einem Klumpen zwischen Leerraum — wie TradingView endet der
    // Raus-Zoom jetzt beim Gesamtbild (alle Kerzen + Rand), weiter raus geht nicht.
    const RAND = 6; // Bars Luft links/rechts im Gesamtbild
    let klemmt = false;
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      const len = dataLenRef.current;
      if (!r || klemmt || !len) return;
      if (r.to - r.from > len - 1 + 2 * RAND + 0.5) {
        klemmt = true;
        chart.timeScale().setVisibleLogicalRange({ from: -RAND, to: len - 1 + RAND });
        klemmt = false;
      }
    });

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
    // Test-Haken für E2E-Zugriff auf die Chart-API (lokale App, kein Risiko)
    (container as unknown as { _chart?: IChartApi })._chart = chart;
    candleRef.current = candle;
    volumeRef.current = volume;
    sma50Ref.current = sma50;
    sma200Ref.current = sma200;

    return () => {
      container.removeEventListener('wheel', onWheel, true);
      container.removeEventListener('dblclick', onDblClick, true);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
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
    priceFixRef.current = null;
    dataLenRef.current = data.candles.length;
    // Startansicht mit Luft nach rechts (Micha, Runde 25): fitContent() presste
    // die heutige Kerze exakt an die Preisskala, die Kurs-Labels verdeckten sie.
    // autoSize misst den Container ERST NACH diesem Effekt und verwirft dabei die
    // Ansicht (deshalb fehlte in Runde 24 das rechte Chart-Ende) — darum wird die
    // Startansicht nach dem Layout über einen ResizeObserver erneut angewendet.
    const setzeStart = () => {
      if (data.candles.length) {
        chart.timeScale().setVisibleLogicalRange({ from: -1, to: data.candles.length - 1 + 6 });
      } else {
        chart.timeScale().fitContent();
      }
    };
    setzeStart();
    let ro: ResizeObserver | null = null;
    if (containerRef.current) {
      ro = new ResizeObserver(() => {
        setzeStart();
        ro?.disconnect();
        ro = null;
      });
      ro.observe(containerRef.current);
    }

    lastBarRef.current = data.candles[data.candles.length - 1] ?? null;
    setOhlc(lastBarRef.current, lastBarRef.current?.volume);
    return () => ro?.disconnect();
  }, [data]);

  // Preislinien
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
      {/* OHLC-Zeile transparent über dem Chart wie bei TradingView (Micha, Runde 28):
          keine Kachel/kein Blur, keine Titelzeile (Name/Zeitraum/Börse stehen oben) —
          nur ein Hauch Text-Schatten, damit die Werte über Kerzen lesbar bleiben */}
      <div
        ref={ohlcRef}
        className="pointer-events-none absolute left-2.5 top-2 z-10 flex gap-2.5 font-mono text-micro text-ink3 tnum"
        style={{ textShadow: '0 1px 4px rgba(11, 14, 20, 0.9)' }}
      />
    </div>
  );
}
