# BTC V3.1 自动化交易 · REAL DATA

这是 V3.1 真实行情模拟交易版。**不生成随机价格、随机 OI、随机资金费率或随机多空比。**

## 本次修正
- OI 同时显示：张、BTC、USD 名义价值；OKX 的 `oi` 是张数，`oiCcy` 是币数量，`oiUsd` 是 USD 折算值。
- 价格、OI、盘口、成交、资金费率优先通过 OKX 公共 WebSocket 实时接收。
- WebSocket 断开或数据过期时，自动使用 OKX 公共 REST 作为真实数据备用通道。
- 账户多空比改为 BTC-USDT-SWAP 单合约口径的公开统计接口，并按时间戳选择最新数据。
- 主动买卖量改为 BTC-USDT-SWAP 单合约 Rubik 统计接口，并按时间戳选择最新数据。
- 增加“数据完整度”，关键数据缺失时不强行生成方向分数。
- 快速行情异常从 5 秒轮询改为 WebSocket 实时价格/OI/成交事件触发，同时保留 REST 备用。
- 模拟仓位按“单笔风险 1.5% + 0.6% 止损 + 最大10x名义仓位”计算，不再使用固定的 30% 资金池仓位。

## 数据
- OKX BTC-USDT-SWAP 最新价、标记价、24h成交量
- OKX Open Interest：oi / oiCcy / oiUsd
- OKX Funding Rate
- OKX WebSocket books5 盘口
- OKX WebSocket trades 成交流
- OKX 15m / 30m / 1H K线
- OKX Rubik：BTC-USDT-SWAP 账户多空比
- OKX Rubik：BTC-USDT-SWAP 主动买入/卖出量
- EMA / RSI / MACD / Bollinger Bands 基于真实K线本地计算

## 模拟账户
- 模拟本金：$10,000
- 策略资金池：$3,000
- 单笔风险：1.5%
- 日亏损上限：3%
- 最大杠杆参数：10x
- 最多 1 仓
- 连续亏损保护：3 次
- 模拟止损：0.6%
- 模拟止盈：1.2%
- **不会发送真实订单，不需要 API Key**

## 重要
GitHub Pages 负责前端展示，Safari 关闭页面后不能保证继续运行。当前版本仍是模拟交易；真实资金交易必须另行部署安全的后端/执行层，API Secret 不能放进 GitHub Pages 前端。

任何真实接口失败都会显示不可用或使用 REST 真实数据备用，**不会用随机数补齐。**
