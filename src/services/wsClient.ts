import {
  AlertRule,
  Candle,
  MarketTick,
  NotificationEvent,
  SignalStatus,
  TechnicalAnalysisReport,
  Timeframe,
  TradingSignal,
} from '../types/trading';

export type WsIncomingMessage =
  | {
      type: 'init:state';
      payload: {
        tick: MarketTick;
        signals: TradingSignal[];
        alerts: AlertRule[];
        notifications: NotificationEvent[];
        analysis: TechnicalAnalysisReport;
        candles: Candle[];
      };
    }
  | {
      type: 'market:tick';
      payload: {
        tick: MarketTick;
        candle: Candle;
        timeframe: Timeframe;
        activeUpdates: {
          id: string;
          currentPrice: number;
          pnlPips: number;
          rMultiple: number;
          status: SignalStatus;
        }[];
      };
    }
  | {
      type: 'analysis:update';
      payload: TechnicalAnalysisReport;
    }
  | {
      type: 'signal:created';
      payload: {
        signal: TradingSignal;
        notification: NotificationEvent;
      };
    }
  | {
      type: 'signal:updated';
      payload: {
        signal: TradingSignal;
        notification: NotificationEvent;
      };
    }
  | {
      type: 'alert:triggered';
      payload: {
        rule: AlertRule;
        notification: NotificationEvent;
      };
    }
  | {
      type: 'alerts:sync';
      payload: AlertRule[];
    };

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export class TradingWsClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private manualClose = false;
  private pendingTimeframe: Timeframe = 'M15';

  constructor(
    private onMessage: (msg: WsIncomingMessage) => void,
    private onConnectionChange: (state: ConnectionState) => void
  ) {}

  public connect(): void {
    this.manualClose = false;
    this.openSocket();
  }

  private openSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.onConnectionChange(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.onConnectionChange('connected');
      this.subscribeTimeframe(this.pendingTimeframe);
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as WsIncomingMessage;
        this.onMessage(parsed);
      } catch {
        // Ignore non-JSON frames
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.manualClose) {
        this.onConnectionChange('reconnecting');
        this.scheduleReconnect();
      } else {
        this.onConnectionChange('disconnected');
      }
    };

    this.ws.onerror = () => {
      // Handled via onclose reconnect flow
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(12_000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualClose) {
        this.openSocket();
      }
    }, delay);
  }

  public subscribeTimeframe(tf: Timeframe): void {
    this.pendingTimeframe = tf;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe:timeframe', timeframe: tf }));
    }
  }

  public disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onConnectionChange('disconnected');
  }
}
