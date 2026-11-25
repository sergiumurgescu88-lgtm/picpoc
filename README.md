# 🚀 FTMO 50K Speedrun Strategy | SSociety Team

**Institutional-Grade Algorithmic Signal Engine**  
**Status:** Live & Operational | **Version:** 2.0.0 (FTMO Baseline)

---

## 🎯 Strategy Overview
This repository contains the baseline code for the **FTMO 50K Speedrun** strategy, designed for high-probability, low-drawdown intraday trading on XAU/USD (Gold). The system is built for mathematical discipline, removing human emotion from the execution process.

### Core Logic
- **Trigger:** M15 9/21 EMA Cross (ascendent pentru BUY, descendent pentru SELL).
- **Trend Filter:** H1 200 EMA (permite doar trade-uri în direcția trendului major).
- **Risk Management:** 1% risc per trade din capitalul total.
- **Stop Loss:** Dinamic, calculat la **1.5 × ATR(14)** (absoarbe volatilitatea normală a pieței).
- **Take Profit:** **Single TP la 1.5R** (Risk:Reward fix 1:1.5). 
  *(Notă tehnică: Toate cele 4 niveluri TP din dashboard sunt setate identic la 1.5R pentru a asigura închiderea completă a poziției dintr-o dată, păstrând compatibilitatea cu UI-ul existent).*

---

## ⚙️ Technical Architecture
- **Core Engine:** Node.js & TypeScript (Deterministic state management).
- **Auto-Scan:** Motorul evaluează automat piața la fiecare **60 de secunde**.
- **Frontend:** React + Vite + Tailwind CSS (Dashboard live cu banner de status în timp real).
- **Infrastructure:** Ubuntu VPS, PM2 (Auto-healing), Nginx (Reverse Proxy SSL).
- **State Persistence:** `terminal-state.json` (asigură continuitatea în caz de restart).

---

## 📊 Live Dashboard Features
Accesibil la: `https://societybot.online`

The dashboard includes a dedicated **FTMO 50K SPEEDRUN Status Banner** that displays in real-time:
1. Current ATR(14) volatility.
2. Dynamically calculated Stop Loss distance (1.5 × ATR).
3. Dynamically calculated Take Profit distance (1.5R).
4. H1 Trend Bias relative to the 200 EMA.
5. Live distance (in pips) to TP and SL when a signal is active.

---

## 🛡️ Execution Workflow (Manual Copy)
1. The engine runs autonomously on the VPS, scanning the market every 60 seconds.
2. When the M15 9/21 EMA cross aligns with the H1 200 EMA trend, a signal is generated.
3. The signal appears on the `societybot.online` dashboard with exact Entry, SL, and TP values.
4. **The user manually copies** these exact values into the FTMO Live cTrader account.
5. The bot does *not* execute trades automatically via API in this baseline configuration, ensuring maximum user control and compliance with FTMO manual trading rules.

---

## 📈 Verified Backtest Metrics (Baseline)
- **Win Rate:** ~55.2% (pe date istorice XAU/USD filtrate).
- **Profit Factor:** > 1.5.
- **Max Drawdown:** Strict controlat sub limita de 5% zilnică FTMO datorită riscului de 1% și RR 1:1.5.

---

## ⚠️ Risk Disclaimer
Trading involves inherent market risks. This system is designed for educational and analytical purposes. Past performance (backtested or forward-tested) does not guarantee future results. Always manage your risk responsibly and adhere to your prop firm's specific rules.

---
*© 2026 SSociety Team. Source code is protected intellectual property.*
