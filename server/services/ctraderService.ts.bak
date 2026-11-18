import crypto from 'crypto';
import WebSocket from 'ws';

const PAYLOAD_TYPES = {
  HEARTBEAT_EVENT: 51,
  OA_APPLICATION_AUTH_REQ: 2100,
  OA_APPLICATION_AUTH_RES: 2101,
  OA_ACCOUNT_AUTH_REQ: 2102,
  OA_ACCOUNT_AUTH_RES: 2103,
  OA_NEW_ORDER_REQ: 2106,
  OA_AMEND_POSITION_SLTP_REQ: 2110,
  OA_CLOSE_POSITION_REQ: 2111,
  OA_ASSET_LIST_REQ: 2112,
  OA_ASSET_LIST_RES: 2113,
  OA_SYMBOLS_LIST_REQ: 2114,
  OA_SYMBOLS_LIST_RES: 2115,
  OA_TRADER_REQ: 2121,
  OA_TRADER_RES: 2122,
  OA_RECONCILE_REQ: 2124,
  OA_RECONCILE_RES: 2125,
  OA_EXECUTION_EVENT: 2126,
  OA_SUBSCRIBE_SPOTS_REQ: 2127,
  OA_SUBSCRIBE_SPOTS_RES: 2128,
  OA_SPOT_EVENT: 2131,
  OA_ERROR_RES: 2142,
  OA_GET_ACCOUNTS_BY_TOKEN_REQ: 2149,
  OA_GET_ACCOUNTS_BY_TOKEN_RES: 2150,
} as const;

export interface CTraderAccountSummary {
  ctidTraderAccountId: number;
  traderLogin: number;
  isLive: boolean;
  brokerTitle: string;
  depositCurrency: string;
  balance: number;
  leverage: number;
}

export interface CTraderOpenPosition {
  positionId: number;
  symbolId: number;
  symbolName: string;
  tradeSide: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  swap: number;
  commission: number;
  openTimestamp: number;
}

export interface CTraderExecutionRecord {
  id: string;
  executionType: string;
  positionId?: number;
  orderId?: number;
  tradeSide?: 'BUY' | 'SELL';
  lots?: number;
  price?: number;
  status: string;
  errorCode?: string;
  timestamp: number;
}

export interface BrokerPublicStatus {
  configured: boolean;
  environment: 'demo' | 'live';
  connectionState: 'DISCONNECTED' | 'CONNECTING' | 'AUTHENTICATED' | 'ERROR';
  lastError: string | null;
  lastSyncAt: number | null;
  tokenExpiresInDays: number;
  oauthAuthorizeUrl: string | null;
  accounts: CTraderAccountSummary[];
  activeAccount: {
    ctidTraderAccountId: number;
    traderLogin: number;
    brokerTitle: string;
    isLive: boolean;
    currency: string;
    balance: number;
    leverage: number;
    accountType: string;
    marginUsed: number;
    freeMargin: number;
  } | null;
  xauSymbol: {
    symbolId: number;
    symbolName: string;
    digits: number;
    lotSizeUnits: number;
    minLots: number;
    stepLots: number;
    bid: number | null;
    ask: number | null;
    spread: number | null;
    spotUpdatedAt: number | null;
  } | null;
  openPositions: CTraderOpenPosition[];
  recentExecutions: CTraderExecutionRecord[];
}

interface PendingRequest {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class CTraderBrokerService {
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pending = new Map<string, PendingRequest>();

  private envMode: 'demo' | 'live' =
    process.env.CTRADER_ENV === 'live' ? 'live' : 'demo';
  private clientId = (process.env.CTRADER_CLIENT_ID || '').trim();
  private clientSecret = (process.env.CTRADER_CLIENT_SECRET || '').trim();
  private accessToken = (process.env.CTRADER_ACCESS_TOKEN || '').trim();
  private refreshToken = (process.env.CTRADER_REFRESH_TOKEN || '').trim();
  private redirectUri = (
    process.env.CTRADER_REDIRECT_URI ||
    process.env.APP_URL ||
    ''
  ).trim();
  private preferredAccountId = Number(process.env.CTRADER_ACCOUNT_ID || 0) || null;

  private connectionState: BrokerPublicStatus['connectionState'] = 'DISCONNECTED';
  private lastError: string | null = null;
  private lastSyncAt: number | null = null;

  private accounts: CTraderAccountSummary[] = [];
  private activeAccountId: number | null = null;
  private activeAccountDetails: BrokerPublicStatus['activeAccount'] = null;
  private assetsMap = new Map<number, string>();
  private symbolsMap = new Map<number, { symbolName: string; digits?: number; lotSize?: number; minVolume?: number; stepVolume?: number }>();
  private xauSymbol: BrokerPublicStatus['xauSymbol'] = null;
  private openPositions: CTraderOpenPosition[] = [];
  private recentExecutions: CTraderExecutionRecord[] = [];
  private isConnecting = false;
  private tokenRefreshedOnce = false;

  public isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.accessToken);
  }

  public async initialize(): Promise<void> {
    if (!this.isConfigured()) {
      this.connectionState = 'DISCONNECTED';
      this.lastError = 'Credențialele cTrader Open API nu sunt configurate în mediul serverului.';
      return;
    }
    try {
      await this.connectAndAuthenticate();
    } catch (err) {
      this.connectionState = 'ERROR';
      this.lastError = err instanceof Error ? err.message : 'Eroare la conectarea cTrader Demo.';
      console.error('[cTrader Demo] Eroare inițializare:', this.lastError);
    }
  }

  private getWsEndpoint(): string {
    return this.envMode === 'live'
      ? 'wss://live.ctraderapi.com:5036'
      : 'wss://demo.ctraderapi.com:5036';
  }

  public async connectAndAuthenticate(targetAccountId?: number): Promise<BrokerPublicStatus> {
    if (!this.isConfigured()) {
      throw new Error('Credențialele cTrader lipsesc din configurația serverului.');
    }
    if (targetAccountId) {
      this.preferredAccountId = targetAccountId;
    }
    if (this.isConnecting) {
      return this.getPublicStatus();
    }

    this.isConnecting = true;
    this.connectionState = 'CONNECTING';
    this.lastError = null;
    this.closeSocketOnly();

    try {
      await this.openWebSocket();

      // Step 1: Application Auth
      await this.sendRequest(PAYLOAD_TYPES.OA_APPLICATION_AUTH_REQ, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });

      // Step 2: Fetch accounts by access token (with automatic refresh fallback if token expired)
      let accountsRes: Record<string, unknown>;
      try {
        accountsRes = await this.sendRequest(PAYLOAD_TYPES.OA_GET_ACCOUNTS_BY_TOKEN_REQ, {
          accessToken: this.accessToken,
        });
      } catch (err) {
        if (!this.tokenRefreshedOnce && this.refreshToken) {
          this.tokenRefreshedOnce = true;
          await this.refreshAccessToken();
          accountsRes = await this.sendRequest(PAYLOAD_TYPES.OA_GET_ACCOUNTS_BY_TOKEN_REQ, {
            accessToken: this.accessToken,
          });
        } else {
          throw err;
        }
      }

      const rawAccounts = Array.isArray(accountsRes.ctidTraderAccount)
        ? (accountsRes.ctidTraderAccount as Record<string, unknown>[])
        : [];

      if (rawAccounts.length === 0) {
        throw new Error(
          'Nu s-au găsit conturi de tranzacționare asociate acestui access token cTrader. Verificați acordarea permisiunilor pe contul demo Pepperstone.'
        );
      }

      this.accounts = rawAccounts.map((acc) => ({
        ctidTraderAccountId: Number(acc.ctidTraderAccountId || 0),
        traderLogin: Number(acc.traderLogin || 0),
        isLive: Boolean(acc.isLive),
        brokerTitle: String(acc.brokerTitleShort || 'Pepperstone / cTrader'),
        depositCurrency: 'EUR',
        balance: 0,
        leverage: 30,
      }));

      // Pick preferred account, else matching env mode (demo preferred)
      const chosen =
        (this.preferredAccountId
          ? this.accounts.find((a) => a.ctidTraderAccountId === this.preferredAccountId)
          : undefined) ||
        this.accounts.find((a) => (this.envMode === 'demo' ? !a.isLive : a.isLive)) ||
        this.accounts[0];

      await this.authorizeAndLoadAccount(chosen.ctidTraderAccountId);

      this.connectionState = 'AUTHENTICATED';
      this.lastSyncAt = Date.now();
      return this.getPublicStatus();
    } catch (err) {
      this.connectionState = 'ERROR';
      this.lastError = err instanceof Error ? err.message : 'Eroare autentificare cTrader.';
      throw err;
    } finally {
      this.isConnecting = false;
    }
  }

  private async authorizeAndLoadAccount(ctidTraderAccountId: number): Promise<void> {
    this.activeAccountId = ctidTraderAccountId;

    // Step 3: Authorize trading account
    await this.sendRequest(PAYLOAD_TYPES.OA_ACCOUNT_AUTH_REQ, {
      ctidTraderAccountId,
      accessToken: this.accessToken,
    });

    // Step 4: Load Assets, Symbols, Trader Profile & Open Positions in parallel
    const [assetRes, symbolsRes, traderRes, reconcileRes] = await Promise.all([
      this.sendRequest(PAYLOAD_TYPES.OA_ASSET_LIST_REQ, { ctidTraderAccountId }),
      this.sendRequest(PAYLOAD_TYPES.OA_SYMBOLS_LIST_REQ, {
        ctidTraderAccountId,
        includeArchivedSymbols: false,
      }),
      this.sendRequest(PAYLOAD_TYPES.OA_TRADER_REQ, { ctidTraderAccountId }),
      this.sendRequest(PAYLOAD_TYPES.OA_RECONCILE_REQ, { ctidTraderAccountId }),
    ]);

    // Map Asset IDs -> currency names
    this.assetsMap.clear();
    const rawAssets = Array.isArray(assetRes.asset)
      ? (assetRes.asset as Record<string, unknown>[])
      : [];
    for (const a of rawAssets) {
      const id = Number(a.assetId || 0);
      const name = String(a.name || '');
      if (id && name) this.assetsMap.set(id, name);
    }

    // Parse Trader Profile (balance, moneyDigits, leverageInCents, currency)
    const trader = (traderRes.trader as Record<string, unknown>) || {};
    const moneyDigits = Number(trader.moneyDigits ?? 2);
    const scale = Math.pow(10, moneyDigits);
    const rawBalance = Number(trader.balance || 0);
    const balance = round2(rawBalance / scale);
    const leverageCents = Number(trader.leverageInCents || 3000);
    const leverage = Math.max(1, Math.round(leverageCents / 100));
    const depositAssetId = Number(trader.depositAssetId || 0);
    const currency = this.assetsMap.get(depositAssetId) || 'EUR';
    const brokerName = String(trader.brokerName || '');
    const accountType = String(trader.accountType || 'HEDGED');

    const accountMeta = this.accounts.find((a) => a.ctidTraderAccountId === ctidTraderAccountId);
    if (accountMeta) {
      accountMeta.balance = balance;
      accountMeta.leverage = leverage;
      accountMeta.depositCurrency = currency;
      if (brokerName) accountMeta.brokerTitle = brokerName;
    }

    this.activeAccountDetails = {
      ctidTraderAccountId,
      traderLogin: Number(trader.traderLogin || accountMeta?.traderLogin || 0),
      brokerTitle: brokerName || accountMeta?.brokerTitle || 'Pepperstone',
      isLive: accountMeta?.isLive ?? false,
      currency,
      balance,
      leverage,
      accountType,
      marginUsed: 0,
      freeMargin: balance,
    };

    // Map symbols and find XAUUSD
    this.symbolsMap.clear();
    const rawSymbols = Array.isArray(symbolsRes.symbol)
      ? (symbolsRes.symbol as Record<string, unknown>[])
      : [];
    let foundXau: {
      symbolId: number;
      symbolName: string;
      digits: number;
      lotSizeUnits: number;
      minLots: number;
      stepLots: number;
    } | null = null;

    for (const sym of rawSymbols) {
      const symbolId = Number(sym.symbolId || 0);
      const symbolName = String(sym.symbolName || '');
      if (!symbolId || !symbolName) continue;
      const digits = Number(sym.digits ?? 2);
      const lotSizeRaw = Number(sym.lotSize || 10000); // Spotware sends lotSize in cents (10000 = 100 units)
      const lotSizeUnits = lotSizeRaw >= 1000 ? lotSizeRaw / 100 : lotSizeRaw;
      const minVolumeRaw = Number(sym.minVolume || 100);
      const stepVolumeRaw = Number(sym.stepVolume || 100);

      this.symbolsMap.set(symbolId, {
        symbolName,
        digits,
        lotSize: lotSizeRaw,
        minVolume: minVolumeRaw,
        stepVolume: stepVolumeRaw,
      });

      const norm = symbolName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!foundXau && (norm === 'XAUUSD' || norm === 'GOLD')) {
        foundXau = {
          symbolId,
          symbolName,
          digits,
          lotSizeUnits,
          minLots: Math.max(0.01, minVolumeRaw / lotSizeRaw),
          stepLots: Math.max(0.01, stepVolumeRaw / lotSizeRaw),
        };
      }
    }

    if (foundXau) {
      this.xauSymbol = {
        ...foundXau,
        bid: this.xauSymbol?.bid ?? null,
        ask: this.xauSymbol?.ask ?? null,
        spread: this.xauSymbol?.spread ?? null,
        spotUpdatedAt: this.xauSymbol?.spotUpdatedAt ?? null,
      };
      // Subscribe to live XAUUSD spot stream on Pepperstone Demo
      await this.sendRequest(PAYLOAD_TYPES.OA_SUBSCRIBE_SPOTS_REQ, {
        ctidTraderAccountId,
        symbolId: [foundXau.symbolId],
        subscribeToSpotTimestamp: true,
      });
    }

    this.parseReconcilePositions(reconcileRes, scale);
  }

  private parseReconcilePositions(reconcileRes: Record<string, unknown>, moneyScale = 100): void {
    const rawPositions = Array.isArray(reconcileRes.position)
      ? (reconcileRes.position as Record<string, unknown>[])
      : [];

    let totalUsedMargin = 0;
    this.openPositions = rawPositions.map((pos) => {
      const tradeData = (pos.tradeData as Record<string, unknown>) || {};
      const symbolId = Number(tradeData.symbolId || 0);
      const symMeta = this.symbolsMap.get(symbolId);
      const lotSizeRaw = symMeta?.lotSize || 10000;
      const volRaw = Number(tradeData.volume || 0);
      const lots = round2(volRaw / lotSizeRaw);
      const usedMarginRaw = Number(pos.usedMargin || 0);
      totalUsedMargin += usedMarginRaw / moneyScale;

      return {
        positionId: Number(pos.positionId || 0),
        symbolId,
        symbolName: symMeta?.symbolName || `SYM-${symbolId}`,
        tradeSide: String(tradeData.tradeSide || 'BUY') === 'SELL' ? 'SELL' : 'BUY',
        lots,
        entryPrice: Number(pos.price || 0),
        stopLoss: pos.stopLoss ? Number(pos.stopLoss) : undefined,
        takeProfit: pos.takeProfit ? Number(pos.takeProfit) : undefined,
        swap: round2(Number(pos.swap || 0) / moneyScale),
        commission: round2(Number(pos.commission || 0) / moneyScale),
        openTimestamp: Number(tradeData.openTimestamp || Date.now()),
      };
    });

    if (this.activeAccountDetails) {
      this.activeAccountDetails.marginUsed = round2(totalUsedMargin);
      this.activeAccountDetails.freeMargin = round2(
        Math.max(0, this.activeAccountDetails.balance - totalUsedMargin)
      );
    }
  }

  public async syncAccountState(): Promise<BrokerPublicStatus> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.activeAccountId) {
      return this.connectAndAuthenticate(this.activeAccountId ?? undefined);
    }

    const ctidTraderAccountId = this.activeAccountId;
    const [traderRes, reconcileRes] = await Promise.all([
      this.sendRequest(PAYLOAD_TYPES.OA_TRADER_REQ, { ctidTraderAccountId }),
      this.sendRequest(PAYLOAD_TYPES.OA_RECONCILE_REQ, { ctidTraderAccountId }),
    ]);

    const trader = (traderRes.trader as Record<string, unknown>) || {};
    const moneyDigits = Number(trader.moneyDigits ?? 2);
    const scale = Math.pow(10, moneyDigits);
    const balance = round2(Number(trader.balance || 0) / scale);
    const leverage = Math.max(1, Math.round(Number(trader.leverageInCents || 3000) / 100));

    if (this.activeAccountDetails) {
      this.activeAccountDetails.balance = balance;
      this.activeAccountDetails.leverage = leverage;
    }
    this.parseReconcilePositions(reconcileRes, scale);
    this.lastSyncAt = Date.now();
    return this.getPublicStatus();
  }

  public async refreshAccessToken(): Promise<{ expiresIn: number; tokenType: string }> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Refresh token sau credențialele aplicației lipsesc.');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(`https://openapi.ctrader.com/apps/token?${params.toString()}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      tokenType?: string;
      errorCode?: string | null;
      description?: string | null;
    };

    if (!res.ok || data.errorCode || !data.accessToken) {
      throw new Error(data.description || data.errorCode || 'Reînnoirea tokenului cTrader a eșuat.');
    }

    this.accessToken = data.accessToken;
    if (data.refreshToken) this.refreshToken = data.refreshToken;
    this.lastSyncAt = Date.now();

    return {
      expiresIn: data.expiresIn ?? 2628000,
      tokenType: data.tokenType ?? 'bearer',
    };
  }

  public async placeDemoOrder(input: {
    tradeSide: 'BUY' | 'SELL';
    lots: number;
    stopLossDistanceUsd?: number;
    takeProfitDistanceUsd?: number;
    comment?: string;
  }): Promise<CTraderExecutionRecord> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.activeAccountId) {
      await this.connectAndAuthenticate();
    }
    if (!this.activeAccountId || !this.activeAccountDetails) {
      throw new Error('Contul demo cTrader nu este autentificat.');
    }
    if (this.activeAccountDetails.isLive) {
      throw new Error('Execuția automată este restricționată exclusiv la contul DEMO pentru siguranță.');
    }
    if (!this.xauSymbol) {
      throw new Error('Simbolul XAUUSD nu a fost găsit pe acest cont Pepperstone.');
    }

    const symMeta = this.symbolsMap.get(this.xauSymbol.symbolId);
    const lotSizeRaw = symMeta?.lotSize || 10000;
    const minVol = symMeta?.minVolume || 100;
    const stepVol = symMeta?.stepVolume || 100;
    const rawProtoVol = Math.round(input.lots * lotSizeRaw);
    const steppedVol = Math.max(minVol, Math.round(rawProtoVol / stepVol) * stepVol);

    const payload: Record<string, unknown> = {
      ctidTraderAccountId: this.activeAccountId,
      symbolId: this.xauSymbol.symbolId,
      orderType: 'MARKET',
      tradeSide: input.tradeSide,
      volume: steppedVol,
      comment: (input.comment || 'SSociety Team · XAUUSD Demo').slice(0, 64),
    };

    // Spotware relative SL/TP for MARKET orders are specified in 1/100000 of price unit
    if (input.stopLossDistanceUsd && input.stopLossDistanceUsd >= 0.5) {
      payload.relativeStopLoss = Math.round(input.stopLossDistanceUsd * 100000);
    }
    if (input.takeProfitDistanceUsd && input.takeProfitDistanceUsd >= 0.5) {
      payload.relativeTakeProfit = Math.round(input.takeProfitDistanceUsd * 100000);
    }

    const res = await this.sendRequest(PAYLOAD_TYPES.OA_NEW_ORDER_REQ, payload);
    const record = this.recordExecutionEvent(res);
    await this.syncAccountState();
    return record;
  }

  public async closeDemoPosition(positionId: number): Promise<CTraderExecutionRecord> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.activeAccountId) {
      throw new Error('Conexiunea cu contul demo cTrader nu este activă.');
    }
    if (this.activeAccountDetails?.isLive) {
      throw new Error('Închiderea rapidă este permisă doar pe contul DEMO.');
    }
    const pos = this.openPositions.find((p) => p.positionId === positionId);
    if (!pos) {
      throw new Error(`Poziția #${positionId} nu a fost găsită printre pozițiile deschise.`);
    }

    const symMeta = this.symbolsMap.get(pos.symbolId);
    const lotSizeRaw = symMeta?.lotSize || 10000;
    const volume = Math.max(symMeta?.minVolume || 100, Math.round(pos.lots * lotSizeRaw));

    const res = await this.sendRequest(PAYLOAD_TYPES.OA_CLOSE_POSITION_REQ, {
      ctidTraderAccountId: this.activeAccountId,
      positionId,
      volume,
    });
    const record = this.recordExecutionEvent(res);
    await this.syncAccountState();
    return record;
  }

  public async amendDemoPositionSlTp(
    positionId: number,
    stopLoss: number,
    takeProfit?: number
  ): Promise<CTraderExecutionRecord> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.activeAccountId) {
      throw new Error('Conexiunea cu contul demo cTrader nu este activă.');
    }
    if (this.activeAccountDetails?.isLive) {
      throw new Error('Modificarea automată SL/TP este permisă exclusiv pe contul DEMO.');
    }
    const pos = this.openPositions.find((p) => p.positionId === positionId);
    if (!pos) {
      throw new Error(`Poziția #${positionId} nu a fost găsită printre pozițiile deschise.`);
    }

    const digits = this.symbolsMap.get(pos.symbolId)?.digits ?? this.xauSymbol?.digits ?? 2;
    const factor = Math.pow(10, digits);
    const cleanSl = Math.round(stopLoss * factor) / factor;
    const effectiveTp = takeProfit ?? pos.takeProfit;

    const payload: Record<string, unknown> = {
      ctidTraderAccountId: this.activeAccountId,
      positionId,
      stopLoss: cleanSl,
    };
    if (effectiveTp !== undefined && effectiveTp > 0) {
      payload.takeProfit = Math.round(effectiveTp * factor) / factor;
    }

    const res = await this.sendRequest(PAYLOAD_TYPES.OA_AMEND_POSITION_SLTP_REQ, payload);
    const record = this.recordExecutionEvent(res);
    await this.syncAccountState();
    return record;
  }

  public async movePositionToBreakeven(positionId: number): Promise<CTraderExecutionRecord> {
    const pos = this.openPositions.find((p) => p.positionId === positionId);
    if (!pos) {
      throw new Error(`Poziția #${positionId} nu a fost găsită printre pozițiile deschise.`);
    }

    const bid = this.xauSymbol?.bid;
    const ask = this.xauSymbol?.ask;
    if (pos.tradeSide === 'BUY' && bid !== null && bid !== undefined && bid <= pos.entryPrice + 0.15) {
      throw new Error(
        `Poziția BUY #${positionId} (Entry ${pos.entryPrice.toFixed(2)}) nu are încă distanță pozitivă suficientă față de Bid (${bid.toFixed(2)}) pentru Breakeven.`
      );
    }
    if (pos.tradeSide === 'SELL' && ask !== null && ask !== undefined && ask >= pos.entryPrice - 0.15) {
      throw new Error(
        `Poziția SELL #${positionId} (Entry ${pos.entryPrice.toFixed(2)}) nu are încă distanță pozitivă suficientă față de Ask (${ask.toFixed(2)}) pentru Breakeven.`
      );
    }

    return this.amendDemoPositionSlTp(positionId, pos.entryPrice, pos.takeProfit);
  }

  public async autoSyncTrailingStopForSignal(direction: 'BUY' | 'SELL'): Promise<number> {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      !this.activeAccountId ||
      this.activeAccountDetails?.isLive
    ) {
      return 0;
    }

    const bid = this.xauSymbol?.bid;
    const ask = this.xauSymbol?.ask;
    let amendedCount = 0;

    for (const pos of [...this.openPositions]) {
      if (pos.tradeSide !== direction) continue;

      if (direction === 'BUY') {
        const needsBreakeven = !pos.stopLoss || pos.stopLoss < pos.entryPrice - 0.02;
        const canPlaceBe = bid !== null && bid !== undefined && bid > pos.entryPrice + 0.25;
        if (needsBreakeven && canPlaceBe) {
          await this.amendDemoPositionSlTp(pos.positionId, pos.entryPrice, pos.takeProfit);
          amendedCount += 1;
        }
      } else {
        const needsBreakeven = !pos.stopLoss || pos.stopLoss > pos.entryPrice + 0.02;
        const canPlaceBe = ask !== null && ask !== undefined && ask < pos.entryPrice - 0.25;
        if (needsBreakeven && canPlaceBe) {
          await this.amendDemoPositionSlTp(pos.positionId, pos.entryPrice, pos.takeProfit);
          amendedCount += 1;
        }
      }
    }

    return amendedCount;
  }

  public getPublicStatus(): BrokerPublicStatus {
    const oauthAuthorizeUrl =
      this.clientId && this.redirectUri
        ? `https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id=${encodeURIComponent(this.clientId)}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=trading&product=web`
        : null;

    return {
      configured: this.isConfigured(),
      environment: this.envMode,
      connectionState: this.connectionState,
      lastError: this.lastError,
      lastSyncAt: this.lastSyncAt,
      tokenExpiresInDays: 30,
      oauthAuthorizeUrl,
      accounts: this.accounts,
      activeAccount: this.activeAccountDetails,
      xauSymbol: this.xauSymbol,
      openPositions: this.openPositions,
      recentExecutions: this.recentExecutions,
    };
  }

  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.getWsEndpoint();
      const ws = new WebSocket(url);
      let settled = false;

      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.terminate();
          reject(new Error(`Timeout la conectarea către ${url}.`));
        }
      }, 8000);

      ws.on('open', () => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimeout);
          this.ws = ws;
          this.startHeartbeat();
          resolve();
        }
      });

      ws.on('message', (raw) => {
        this.handleIncomingFrame(raw.toString());
      });

      ws.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimeout);
          reject(err instanceof Error ? err : new Error('Eroare WebSocket cTrader'));
        }
      });

      ws.on('close', () => {
        this.stopHeartbeat();
        if (this.ws === ws) {
          this.ws = null;
          if (this.connectionState === 'AUTHENTICATED') {
            this.connectionState = 'DISCONNECTED';
            this.scheduleReconnect();
          }
        }
        for (const [id, req] of this.pending.entries()) {
          clearTimeout(req.timer);
          req.reject(new Error('Conexiunea WebSocket cTrader s-a închis.'));
          this.pending.delete(id);
        }
      });
    });
  }

  private handleIncomingFrame(rawText: string): void {
    try {
      const frame = JSON.parse(rawText) as {
        clientMsgId?: string;
        payloadType?: number;
        payload?: Record<string, unknown>;
      };
      const pType = frame.payloadType;
      const payload = frame.payload || {};

      if (pType === PAYLOAD_TYPES.HEARTBEAT_EVENT) {
        return;
      }

      if (pType === PAYLOAD_TYPES.OA_SPOT_EVENT) {
        this.handleSpotEvent(payload);
        return;
      }

      if (pType === PAYLOAD_TYPES.OA_EXECUTION_EVENT) {
        const execRecord = this.recordExecutionEvent(payload);
        if (frame.clientMsgId && this.pending.has(frame.clientMsgId)) {
          const req = this.pending.get(frame.clientMsgId)!;
          clearTimeout(req.timer);
          this.pending.delete(frame.clientMsgId);
          if (execRecord.errorCode) {
            req.reject(new Error(`Execuție respinsă (${execRecord.errorCode})`));
          } else {
            req.resolve(payload);
          }
        } else if (
          execRecord.executionType === 'ORDER_FILLED' ||
          execRecord.executionType === 'POSITION_CLOSED' ||
          execRecord.executionType === 'ORDER_PARTIAL_FILL'
        ) {
          void this.syncAccountState().catch(() => {});
        }
        return;
      }

      if (frame.clientMsgId && this.pending.has(frame.clientMsgId)) {
        const req = this.pending.get(frame.clientMsgId)!;
        clearTimeout(req.timer);
        this.pending.delete(frame.clientMsgId);

        if (pType === PAYLOAD_TYPES.OA_ERROR_RES) {
          const errCode = String(payload.errorCode || 'ERROR');
          const desc = String(payload.description || errCode);
          req.reject(new Error(`${errCode}: ${desc}`));
        } else {
          req.resolve(payload);
        }
      }
    } catch {
      // Ignore malformed JSON frames
    }
  }

  private handleSpotEvent(payload: Record<string, unknown>): void {
    const symbolId = Number(payload.symbolId || 0);
    if (!this.xauSymbol || symbolId !== this.xauSymbol.symbolId) return;

    // Spotware ProtoOASpotEvent sends bid/ask scaled by 100000
    const rawBid = payload.bid !== undefined ? Number(payload.bid) : null;
    const rawAsk = payload.ask !== undefined ? Number(payload.ask) : null;
    const digits = this.xauSymbol.digits || 2;
    const factor = Math.pow(10, digits);

    const nextBid =
      rawBid !== null ? Math.round((rawBid / 100000) * factor) / factor : this.xauSymbol.bid;
    const nextAsk =
      rawAsk !== null ? Math.round((rawAsk / 100000) * factor) / factor : this.xauSymbol.ask;

    this.xauSymbol.bid = nextBid;
    this.xauSymbol.ask = nextAsk;
    if (nextBid !== null && nextAsk !== null) {
      this.xauSymbol.spread = round2(Math.max(0, nextAsk - nextBid));
    }
    this.xauSymbol.spotUpdatedAt = Date.now();
  }

  private recordExecutionEvent(payload: Record<string, unknown>): CTraderExecutionRecord {
    const pos = (payload.position as Record<string, unknown>) || {};
    const order = (payload.order as Record<string, unknown>) || {};
    const tradeData = (pos.tradeData as Record<string, unknown>) || (order.tradeData as Record<string, unknown>) || {};
    const symId = Number(tradeData.symbolId || this.xauSymbol?.symbolId || 0);
    const lotSizeRaw = this.symbolsMap.get(symId)?.lotSize || 10000;
    const volRaw = Number(tradeData.volume || order.executedVolume || 0);

    const record: CTraderExecutionRecord = {
      id: `exec-${crypto.randomBytes(3).toString('hex')}`,
      executionType: String(payload.executionType || 'ORDER_ACCEPTED'),
      positionId: pos.positionId ? Number(pos.positionId) : undefined,
      orderId: order.orderId ? Number(order.orderId) : undefined,
      tradeSide: tradeData.tradeSide ? (String(tradeData.tradeSide) === 'SELL' ? 'SELL' : 'BUY') : undefined,
      lots: volRaw > 0 ? round2(volRaw / lotSizeRaw) : undefined,
      price: order.executionPrice ? Number(order.executionPrice) : pos.price ? Number(pos.price) : undefined,
      status: String(order.orderStatus || pos.positionStatus || 'PROCESSED'),
      errorCode: payload.errorCode ? String(payload.errorCode) : undefined,
      timestamp: Date.now(),
    };

    this.recentExecutions.unshift(record);
    if (this.recentExecutions.length > 20) {
      this.recentExecutions = this.recentExecutions.slice(0, 20);
    }
    return record;
  }

  private sendRequest(
    payloadType: number,
    payload: Record<string, unknown>,
    timeoutMs = 8000
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket cTrader neconectat.'));
        return;
      }

      const clientMsgId = crypto.randomBytes(8).toString('hex');
      const timer = setTimeout(() => {
        this.pending.delete(clientMsgId);
        reject(new Error(`Timeout răspuns cTrader pentru payloadType=${payloadType}`));
      }, timeoutMs);

      this.pending.set(clientMsgId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            clientMsgId: crypto.randomBytes(4).toString('hex'),
            payloadType: PAYLOAD_TYPES.HEARTBEAT_EVENT,
            payload: {},
          })
        );
      }
    }, 20_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isConfigured() && this.connectionState !== 'AUTHENTICATED') {
        void this.connectAndAuthenticate().catch(() => {});
      }
    }, 10_000);
  }

  private closeSocketOnly(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {
        // Ignore terminate error
      }
      this.ws = null;
    }
  }

  public dispose(): void {
    this.closeSocketOnly();
  }
}
