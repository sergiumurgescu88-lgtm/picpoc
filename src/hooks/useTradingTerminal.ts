import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationService } from '../services/notificationService';
import { ConnectionState, TradingWsClient, WsIncomingMessage } from '../services/wsClient';
import {
  AlertRule,
  Candle,
  MarketTick,
  NotificationEvent,
  SecurityAuditSnapshot,
  StrategyPolicy,
  TechnicalAnalysisReport,
  Timeframe,
  TradingSignal,
} from '../types/trading';

export function useTradingTerminal() {
  const [timeframe, setTimeframeState] = useState<Timeframe>('M15');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [tick, setTick] = useState<MarketTick | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<TechnicalAnalysisReport | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [strategyPolicy, setStrategyPolicy] = useState<StrategyPolicy>('EXIT_PROFIT_ON_REVERSAL');
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [toasts, setToasts] = useState<NotificationEvent[]>([]);
  const [securityAudit, setSecurityAudit] = useState<SecurityAuditSnapshot | null>(null);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [browserPushEnabled, setBrowserPushEnabled] = useState<boolean>(
    () => notificationService.getPermissionStatus() === 'granted'
  );
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const soundRef = useRef(soundEnabled);
  const pushRef = useRef(browserPushEnabled);
  const tfRef = useRef(timeframe);
  const wsRef = useRef<TradingWsClient | null>(null);

  soundRef.current = soundEnabled;
  pushRef.current = browserPushEnabled;
  tfRef.current = timeframe;

  const pushNotification = useCallback((event: NotificationEvent) => {
    setNotifications((prev) => {
      if (prev.some((n) => n.id === event.id)) return prev;
      return [event, ...prev].slice(0, 50);
    });
    setToasts((prev) => {
      if (prev.some((n) => n.id === event.id)) return prev;
      return [event, ...prev].slice(0, 4);
    });

    if (soundRef.current) {
      notificationService.playAlertSound(event.category);
    }
    if (pushRef.current) {
      notificationService.sendBrowserNotification(event);
    }

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== event.id));
    }, 6500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchSnapshot = useCallback(async (tf: Timeframe) => {
    try {
      setIsLoadingSnapshot(true);
      const res = await fetch(`/api/market/snapshot?timeframe=${tf}`);
      if (!res.ok) throw new Error('Eroare la preluarea datelor de piață');
      const data = (await res.json()) as {
        tick: MarketTick;
        candles: Candle[];
        analysis: TechnicalAnalysisReport;
      };
      setTick(data.tick);
      setCandles(data.candles);
      setAnalysis(data.analysis);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Eroare de conexiune');
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, []);

  const fetchSecurityAudit = useCallback(async () => {
    try {
      const res = await fetch('/api/security/audit');
      if (res.ok) {
        const data = (await res.json()) as SecurityAuditSnapshot;
        setSecurityAudit(data);
      }
    } catch {
      // Ignore silent background audit refresh failure
    }
  }, []);

  useEffect(() => {
    const handleWsMessage = (msg: WsIncomingMessage) => {
      switch (msg.type) {
        case 'init:state': {
          setTick(msg.payload.tick);
          const uniqueSignals = Array.from(
            new Map(msg.payload.signals.map((s) => [s.id, s])).values()
          );
          setSignals(uniqueSignals);
          if (msg.payload.policy) setStrategyPolicy(msg.payload.policy);
          setAlerts(msg.payload.alerts);
          setNotifications(msg.payload.notifications);
          if (tfRef.current === 'M15') {
            setCandles(msg.payload.candles);
            setAnalysis(msg.payload.analysis);
            setIsLoadingSnapshot(false);
          }
          setSelectedSignalId((prev) => prev ?? uniqueSignals[0]?.id ?? null);
          break;
        }
        case 'market:tick': {
          setTick(msg.payload.tick);
          if (msg.payload.timeframe === tfRef.current && msg.payload.candle) {
            const incoming = msg.payload.candle;
            setCandles((prev) => {
              if (prev.length === 0) return [incoming];
              const last = prev[prev.length - 1];
              if (last.time === incoming.time) {
                const next = [...prev];
                next[next.length - 1] = incoming;
                return next;
              }
              if (incoming.time > last.time) {
                return [...prev.slice(-199), incoming];
              }
              return prev;
            });
          }

          if (msg.payload.activeUpdates.length > 0) {
            const updateMap = new Map(msg.payload.activeUpdates.map((u) => [u.id, u]));
            setSignals((prev) =>
              prev.map((s) => {
                const u = updateMap.get(s.id);
                if (!u) return s;
                return {
                  ...s,
                  stopLoss: u.stopLoss,
                  initialStopLoss: u.initialStopLoss ?? s.initialStopLoss,
                  currentPrice: u.currentPrice,
                  pnlPips: u.pnlPips,
                  rMultiple: u.rMultiple,
                  status: u.status,
                  reachedTargets: u.reachedTargets,
                  resolution: u.resolution,
                  closedAt: u.closedAt ?? s.closedAt,
                  exitReason: u.exitReason ?? s.exitReason,
                  exitNote: u.exitNote ?? s.exitNote,
                  trendWarning: u.trendWarning !== undefined ? u.trendWarning : s.trendWarning,
                };
              })
            );
          }
          break;
        }
        case 'candles:sync': {
          setTick(msg.payload.tick);
          if (msg.payload.timeframe === tfRef.current) {
            setCandles(msg.payload.candles);
          }
          break;
        }
        case 'analysis:update': {
          if (msg.payload.timeframe === tfRef.current) {
            setAnalysis(msg.payload);
          }
          break;
        }
        case 'signal:created': {
          const { signal, notification } = msg.payload;
          setSignals((prev) => {
            if (prev.some((s) => s.id === signal.id)) return prev;
            return [signal, ...prev];
          });
          setSelectedSignalId(signal.id);
          pushNotification(notification);
          break;
        }
        case 'signal:updated': {
          const { signal, notification } = msg.payload;
          setSignals((prev) => prev.map((s) => (s.id === signal.id ? signal : s)));
          pushNotification(notification);
          break;
        }
        case 'policy:updated': {
          const { policy, notification } = msg.payload;
          setStrategyPolicy(policy);
          pushNotification(notification);
          break;
        }
        case 'alert:triggered': {
          const { rule, notification } = msg.payload;
          setAlerts((prev) => prev.map((r) => (r.id === rule.id ? rule : r)));
          pushNotification(notification);
          break;
        }
        case 'alerts:sync': {
          setAlerts(msg.payload);
          break;
        }
      }
    };

    const client = new TradingWsClient(handleWsMessage, setConnectionState);
    wsRef.current = client;
    client.connect();

    void fetchSnapshot('M15');
    void fetchSecurityAudit();

    return () => {
      client.disconnect();
    };
  }, [fetchSecurityAudit, fetchSnapshot, pushNotification]);

  const changeTimeframe = useCallback(
    (tf: Timeframe) => {
      setTimeframeState(tf);
      wsRef.current?.subscribeTimeframe(tf);
      void fetchSnapshot(tf);
    },
    [fetchSnapshot]
  );

  const triggerManualScan = useCallback(async () => {
    try {
      setIsScanning(true);
      const res = await fetch('/api/signals/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe: tfRef.current }),
      });
      const data = (await res.json()) as {
        created: boolean;
        signal?: TradingSignal;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Scanarea nu a putut fi executată');
      }
      if (!data.created && data.message) {
        pushNotification({
          id: `scan-info-${Date.now()}`,
          category: 'SYSTEM',
          severity: 'INFO',
          title: 'Rezultat Scanare Piață',
          message: data.message,
          price: tick?.mid ?? 0,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Eroare la scanare');
    } finally {
      setIsScanning(false);
    }
  }, [pushNotification, tick?.mid]);

  const closeSignal = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/signals/${encodeURIComponent(id)}/close`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || 'Eroare la închiderea semnalului');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Eroare');
    }
  }, []);

  const updateStrategyPolicy = useCallback(async (policy: StrategyPolicy) => {
    try {
      const res = await fetch('/api/signals/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || 'Nu s-a putut actualiza politica');
      }
      const data = (await res.json()) as { policy: StrategyPolicy };
      setStrategyPolicy(data.policy);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Eroare la actualizarea politicii');
    }
  }, []);

  const createAlertRule = useCallback(
    async (payload: {
      type: AlertRule['type'];
      threshold?: number;
      timeframe?: Timeframe;
      note: string;
    }) => {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || 'Date invalidă pentru alertă');
      }
    },
    []
  );

  const toggleAlertRule = useCallback(async (id: string) => {
    await fetch(`/api/alerts/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' });
  }, []);

  const deleteAlertRule = useCallback(async (id: string) => {
    await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }, []);

  const enableBrowserNotifications = useCallback(async () => {
    const perm = await notificationService.requestBrowserPermission();
    setBrowserPushEnabled(perm === 'granted');
    if (perm === 'granted') {
      notificationService.playAlertSound('SYSTEM');
    }
    return perm;
  }, []);

  return {
    timeframe,
    changeTimeframe,
    connectionState,
    tick,
    candles,
    analysis,
    signals,
    strategyPolicy,
    updateStrategyPolicy,
    selectedSignalId,
    setSelectedSignalId,
    alerts,
    notifications,
    toasts,
    dismissToast,
    securityAudit,
    fetchSecurityAudit,
    soundEnabled,
    setSoundEnabled,
    browserPushEnabled,
    enableBrowserNotifications,
    isScanning,
    isLoadingSnapshot,
    errorMessage,
    setErrorMessage,
    triggerManualScan,
    closeSignal,
    createAlertRule,
    toggleAlertRule,
    deleteAlertRule,
  };
}
