import { useEffect, useState } from 'react';
import { AlertsSecurityView } from './components/AlertsSecurityView';
import { ChartPanel } from './components/ChartPanel';
import { CorrelationMatrix } from './components/CorrelationMatrix';
import { ActiveTab, Header } from './components/Header';
import { MarketNewsFeed } from './components/MarketNewsFeed';
import { MarketSentimentIndicator } from './components/MarketSentimentIndicator';
import { NotificationToastStack } from './components/NotificationToastStack';
import { RiskCalculatorPanel } from './components/RiskCalculatorPanel';
import { SignalCardList } from './components/SignalCardList';
import { SignalResolutionPanel } from './components/SignalResolutionPanel';
import { TechnicalAnalysisPanel } from './components/TechnicalAnalysisPanel';
import { VolatilityHeatmap } from './components/VolatilityHeatmap';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { StrategyStatusBanner } from './components/StrategyStatusBanner';

import { useTradingTerminal } from './hooks/useTradingTerminal';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('terminal');
  const [isDark, setIsDark] = useState<boolean>(true);

  const {
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
  } = useTradingTerminal();

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [isDark]);

  const selectedSignal = signals.find((s) => s.id === selectedSignalId) ?? signals[0] ?? null;

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#090C12] text-slate-900 dark:text-slate-100">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onScan={() => void triggerManualScan()}
        isScanning={isScanning}
      />

      <WorkspaceToolbar
        tick={tick}
        timeframe={timeframe}
        onSelectTimeframe={changeTimeframe}
        connectionState={connectionState}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        browserPushEnabled={browserPushEnabled}
        onEnablePush={() => void enableBrowserNotifications()}
        isDark={isDark}
        onToggleTheme={() => setIsDark((v) => !v)}
        onQuickAddPriceAlert={createAlertRule}
      />

      {/* FTMO Strategy Status Banner */}
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 pt-4">
        <StrategyStatusBanner
          atr14={analysis?.indicators?.atr14 ?? null}
          currentPrice={tick?.mid ?? null}
          ema200M15={analysis?.emaSeries?.ema200?.[analysis.emaSeries.ema200.length - 1]?.value ?? null}
          activeSignal={signals.find((s) => s.status === 'ACTIVE') ?? null}
          isScanning={isScanning}
        />
      </div>

      {errorMessage && (
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 flex items-center justify-between text-xs text-rose-600 dark:text-rose-300">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="font-semibold hover:underline cursor-pointer"
            >
              Închide
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'terminal' && (
          <div className="space-y-6">
            {/* Primary Workspace Split: Chart + Live Signal Feed */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-8 space-y-6">
                <ChartPanel
                  candles={candles}
                  analysis={analysis}
                  selectedSignal={selectedSignal}
                  timeframe={timeframe}
                  isDark={isDark}
                  isLoading={isLoadingSnapshot}
                  sourceDetail={tick?.sourceDetail}
                />
                <VolatilityHeatmap isDark={isDark} />
                <CorrelationMatrix isDark={isDark} />
                <TechnicalAnalysisPanel analysis={analysis} compact />
              </div>

              <div className="xl:col-span-4 space-y-6">
                <MarketSentimentIndicator timeframe={timeframe} />
                <SignalCardList
                  signals={signals}
                  selectedSignalId={selectedSignal?.id ?? null}
                  strategyPolicy={strategyPolicy}
                  onChangePolicy={(policy) => void updateStrategyPolicy(policy)}
                  onSelectSignal={setSelectedSignalId}
                  onCloseSignal={(id) => void closeSignal(id)}
                  onLoadInCalculator={(sig) => {
                    setSelectedSignalId(sig.id);
                    setActiveTab('risk');
                  }}
                  onOpenResolution={() => setActiveTab('resolution')}
                />
                <MarketNewsFeed />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && <TechnicalAnalysisPanel analysis={analysis} />}

        {activeTab === 'resolution' && (
          <SignalResolutionPanel
            signals={signals}
            isDark={isDark}
            onInspectSignal={(id) => {
              setSelectedSignalId(id);
              setActiveTab('terminal');
            }}
          />
        )}

        {activeTab === 'risk' && (
          <RiskCalculatorPanel
            signals={signals}
            selectedSignal={selectedSignal}
            currentPrice={tick?.mid ?? null}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertsSecurityView
            alerts={alerts}
            notifications={notifications}
            securityAudit={securityAudit}
            currentPrice={tick?.mid ?? null}
            onCreateAlert={createAlertRule}
            onToggleAlert={toggleAlertRule}
            onDeleteAlert={deleteAlertRule}
            onRefreshAudit={fetchSecurityAudit}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-[#1C2331] py-4 px-4 sm:px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>SSociety Team · Terminal Analiză Tehnică & Semnale XAU/USD</span>
          <span>Avertisment: Analiza tehnică are scop informativ și educațional; gestionați riscul responsabil.</span>
        </div>
      </footer>

      <NotificationToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
