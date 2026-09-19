# BTC V3.2 自动化交易 · OKX REAL DATA DEMO

本版本以 OKX BTC-USDT-SWAP 的公开真实市场数据为基础进行本地模拟，不连接真实资金。

## 按 OKX 规则模拟
- 永续合约：BTC-USDT-SWAP
- 逐仓模式
- 合约张数使用 OKX instrument 的 ctVal / lotSz / tickSz
- 开多模拟按卖一价（ask）成交，开空按买一价（bid）成交
- 平多按买一价（bid）成交，平空按卖一价（ask）成交
- 未实现盈亏使用 OKX 标记价格（markPx）计算
- 线性合约盈亏： (标记/成交价差) × 持仓张数 × ctVal
- 交易手续费按模拟账户 taker 费率计算；默认 0.05%，后续可替换为用户自己的 OKX 实际费率
- 资金费按 OKX fundingRate / nextFundingTime 进行到期结算模拟
- 10,000 USDT 为本地模拟初始本金
- 每笔订单从开仓到平仓保持一条完整记录

## 数据
- OKX REST 历史K线、ticker、OI、资金费率、合约参数
- OKX WebSocket ticker、mark-price、OI、funding-rate、trades、1m/5m/15m/30m/1H K线

## 注意
这是模拟交易，不会向 OKX 发送下单请求，也不会动用真实资金。若以后接 OKX 官方模拟盘 API，需要使用模拟盘 API Key，并在请求中使用 `x-simulated-trading: 1`。

V3.2 FINAL SELF-CHECK 4 updates:
- Uses OKX public real-time market data endpoints/WebSocket.
- Uses OKX BTC-USDT-SWAP instrument metadata including ctVal, ctMult, lotSz and tickSz.
- Uses OKX mark price for unrealized PnL.
- Uses OKX incremental books channel for simulated order-book execution.
- Funding settlement uses realizedRate from OKX funding-rate-history when a funding time is due.
- 10,000 USDT remains a local simulation account; no real order is submitted.


V3.2 FINAL SELF-CHECK 5 updates:
- 24h volume display now converts OKX SWAP volCcy24h (base BTC) into approximate USDT 24h turnover using the live BTC price, and labels it as 24h turnover.
- Automatic simulated trading defaults to OFF on a fresh load; tapping “开启” enables automatic simulated order opening/management, and the button shows “关闭” while automation is running.
- Version 5 uses a new local simulation ledger namespace so an older browser balance such as 9,994.46 USDT is not silently reused as the new 10,000 USDT starting account.
- This remains simulation only; no real OKX order is submitted.
