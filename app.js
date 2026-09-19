const CFG={
  base:'https://www.okx.com',
  ws:'wss://ws.okx.com:8443/ws/v5/public',
  instId:'BTC-USDT-SWAP',
  equity0:10000,
  pool0:3000,
  riskPct:.015,
  dailyLossPct:.03,
  maxLeverage:10,
  feeRate:.0005,
  restPollMs:10000,
  rubikPollMs:30000,
  candlePollMs:30000
};
const S={
  equity:CFG.equity0,pool:CFG.pool0,pnl:0,running:false,
  price:null,mark:null,oi:null,oiCcy:null,oiUsd:null,prevOi:null,prevOiUsd:null,
  funding:null,ratio:null,volume:null,bookImbalance:null,taker:null,
  candles:{},signal:'等待真实数据',score:null,position:null,entry:null,stop:null,target:null,
  positionNotional:0,lossStreak:0,dayStart:CFG.equity0,logs:[],lastData:0,alerts:[],
  ws:null,wsConnected:false,lastWs:0,lastTradePx:null,tradeFlow:{buy:0,sell:0},
  dataFlags:{ticker:false,oi:false,funding:false,book:false,candles:false,ratio:false,taker:false},
  timers:{}
};
const $=id=>document.getElementById(id);
const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'--';
function log(x){S.logs.unshift(new Date().toLocaleTimeString()+'  '+x);S.logs=S.logs.slice(0,40);$('log').textContent=S.logs.join('\n');}
function pct(x,d=3){return Number.isFinite(x)?(x*100).toFixed(d)+'%':'--'}
function set(id,v){if($(id))$(id).textContent=v}
function completeness(){return Object.values(S.dataFlags).filter(Boolean).length/Object.keys(S.dataFlags).length*100}
function render(){
  set('equity',fmt(S.equity));set('pool',fmt(S.pool));set('pnl',fmt(S.pnl));
  set('price',S.price?fmt(S.price):'--');set('oi',S.oi?fmt(S.oi,2):'--');
  set('oiCcy',S.oiCcy?fmt(S.oiCcy,4):'--');set('oiUsd',S.oiUsd?('$'+fmt(S.oiUsd,0)):'--');
  set('funding',S.funding!=null?pct(S.funding,4):'--');set('ratio',S.ratio!=null?S.ratio.toFixed(3):'--');
  set('volume',S.volume?fmt(S.volume,2):'--');set('position',S.position?`${S.position==='long'?'多':'空'} @ ${fmt(S.entry)}`:'空仓');
  set('signal',S.signal);set('score',S.score==null?'--':S.score);set('oidelta',S.prevOi&&S.oi?((S.oi/S.prevOi-1)*100).toFixed(2)+'%':'--');
  set('imbalance',S.bookImbalance!=null?(S.bookImbalance*100).toFixed(1)+'%':'--');
  set('taker',S.taker!=null?(S.taker*100).toFixed(1)+'%买方':'--');
  set('dataCompleteness',completeness().toFixed(0)+'%');
  set('wsStatus',S.wsConnected?'WebSocket 实时':'REST 备用');
  $('alerts').textContent=S.alerts.length?S.alerts.slice(0,5).join(' | '):'暂无异常事件';
}
async function api(path){const r=await fetch(CFG.base+path,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.code!=='0')throw Error(j.msg||'API error');return j.data}
function parseCandle(a){return a.slice().reverse().map(x=>({ts:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],vol:+x[5]}))}
async function loadCandles(bar){const d=await api(`/api/v5/market/candles?instId=${CFG.instId}&bar=${bar}&limit=100`);S.candles[bar]=parseCandle(d)}
function ema(a,n){const k=2/(n+1);let e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a,n=14){if(a.length<n+1)return null;let g=0,l=0;for(let i=a.length-n;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}if(l===0)return 100;const rs=(g/n)/(l/n);return 100-100/(1+rs)}
function macd(a){if(a.length<35)return null;return ema(a,12)-ema(a,26)}
function bb(a,n=20){if(a.length<n)return null;const x=a.slice(-n),m=x.reduce((s,v)=>s+v,0)/n,sd=Math.sqrt(x.reduce((s,v)=>s+(v-m)**2,0)/n);return {m,up:m+2*sd,lo:m-2*sd}}
function tf(bar){const c=S.candles[bar]||[];if(c.length<30)return {trend:'数据不足',score:null};const a=c.map(x=>x.c),last=a.at(-1),e20=ema(a,20),e50=ema(a,50),R=rsi(a),M=macd(a),B=bb(a);let score=(last>e20?1:-1)+(e20>e50?1:-1)+(R>55?1:R<45?-1:0)+(M>0?1:-1);return {trend:score>=2?'偏多':score<=-2?'偏空':'震荡',score,last,e20,e50,R,M,B}}
function analyse(){
  const t15=tf('15m'),t30=tf('30m'),t60=tf('1H');
  set('tf15',t15.trend);set('tf30',t30.trend);set('tf60',t60.trend);
  const t=t15.last?t15:t30;set('ema',t.e20?fmt(t.e20):'--');set('rsi',t.R!=null?t.R.toFixed(1):'--');set('macd',t.M!=null?fmt(t.M,2):'--');
  if(t.B&&t.last){const pos=(t.last-t.B.lo)/(t.B.up-t.B.lo||1);set('bb',(pos*100).toFixed(1)+'%')}else set('bb','--');
  let score=0,maxScore=0;const parts=[];
  [t15,t30,t60].forEach((x,i)=>{if(x.score!=null){const w=i===2?2:i===1?1.5:1;score+=x.score*w;maxScore+=4*w;parts.push(`${['15m','30m','1h'][i]}${x.trend}`)}});
  if(S.oi&&S.prevOi&&S.price&&S._prevPrice){const od=S.oi/S.prevOi-1,pd=S.price/S._prevPrice-1;if(pd>0&&od>0){score+=1.5;parts.push('价升OI升')}if(pd<0&&od>0){score-=1.5;parts.push('价跌OI升')}if(pd>0&&od<0){score-=.5;parts.push('价升OI降')}if(pd<0&&od<0){score+=.5;parts.push('价跌OI降')}maxScore+=1.5}
  if(S.funding!=null){if(S.funding>0.0002){score-=.8;parts.push('正资金费率')}else if(S.funding<-0.0002){score+=.8;parts.push('负资金费率')}maxScore+=.8}
  if(S.ratio!=null){if(S.ratio>1.05){score+=.7;parts.push('账户多空比偏多')}else if(S.ratio<.95){score-=.7;parts.push('账户多空比偏空')}maxScore+=.7}
  if(S.bookImbalance!=null){score+=S.bookImbalance*1.2;parts.push('盘口真实失衡');maxScore+=1.2}
  if(S.taker!=null){score+=(S.taker-.5)*3;parts.push('主动成交真实数据');maxScore+=1.5}
  const enoughCore=t15.score!=null&&t30.score!=null&&t60.score!=null&&S.price!=null&&S.oi!=null&&S.bookImbalance!=null;
  const normalized=maxScore?score/maxScore*100:0;
  S.score=enoughCore?Math.round(Math.max(-100,Math.min(100,normalized))):null;
  if(!enoughCore)S.signal='数据不足';else S.signal=S.score>=35?'偏多':S.score<=-35?'偏空':'观望';
  $('reason').textContent=parts.length?parts.join(' · '):'等待更多真实数据形成交叉确认';
  render();return {t15,t30,t60}
}
function riskAllows(){const daily=Math.max(0,CFG.equity0-S.equity);return daily<=CFG.equity0*CFG.dailyLossPct&&S.lossStreak<3}
function simulate(){
  if(!S.running||!S.price||!riskAllows())return;
  if(S.position){const dir=S.position==='long'?1:-1,ret=(S.price-S.entry)/S.entry*dir;if(ret<=-0.006||ret>=0.012){const notional=S.positionNotional||0,gross=notional*ret,fee=notional*CFG.feeRate*2,pnl=gross-fee;S.equity+=pnl;S.pool+=pnl;S.pnl+=pnl;S.lossStreak=pnl<0?S.lossStreak+1:0;log(`模拟平${S.position==='long'?'多':'空'} @ ${fmt(S.price)}，本次 ${pnl>=0?'+':''}$${fmt(pnl)}`);S.position=null;S.entry=null;S.positionNotional=0;}}
  if(!S.position&&S.score!=null&&Math.abs(S.score)>=45&&riskAllows()){
    const stopPct=.006,riskCapital=Math.min(S.pool,S.equity*CFG.riskPct),notional=Math.min(riskCapital/stopPct,S.pool*CFG.maxLeverage);
    S.position=S.score>0?'long':'short';S.entry=S.price;S.positionNotional=notional;log(`模拟开${S.position==='long'?'多':'空'} @ ${fmt(S.entry)}，信号 ${S.score}，名义仓位 $${fmt(notional)}`)
  }
  render()
}
function updateBook(data){const b=data[0];if(!b)return;const bid=b.bids.reduce((s,x)=>s+(+x[0])*(+x[1]),0),ask=b.asks.reduce((s,x)=>s+(+x[0])*(+x[1]),0);S.bookImbalance=(bid-ask)/(bid+ask||1);S.dataFlags.book=true}
function updatePrice(px){if(!Number.isFinite(px))return;S._prevPrice=S.price;S.price=px;S.lastData=Date.now();S.dataFlags.ticker=true;if(S._prevPrice){const p=(S.price/S._prevPrice-1)*100;if(Math.abs(p)>=.25)S.alerts.unshift(`⚡ 实时价格变化 ${p.toFixed(2)}%`)}if(S.alerts.length>10)S.alerts=S.alerts.slice(0,10);analyse()}
function updateOi(x){S.prevOi=S.oi;S.prevOiUsd=S.oiUsd;S.oi=+x.oi;S.oiCcy=+x.oiCcy;S.oiUsd=+x.oiUsd;S.dataFlags.oi=true;if(S.prevOi){const o=(S.oi/S.prevOi-1)*100;if(Math.abs(o)>=.3)S.alerts.unshift(`⚡ 实时OI变化 ${o.toFixed(2)}%`)}}
function connectWS(){
  try{if(S.ws)S.ws.close()}catch(e){}
  const ws=new WebSocket(CFG.ws);S.ws=ws;
  ws.onopen=()=>{S.wsConnected=true;set('wsStatus','WebSocket 实时');$('dataStatus').textContent='已连接：OKX WebSocket 实时行情 + REST统计';ws.send(JSON.stringify({op:'subscribe',args:[
    {channel:'tickers',instId:CFG.instId},{channel:'open-interest',instId:CFG.instId},{channel:'books5',instId:CFG.instId},{channel:'trades',instId:CFG.instId},{channel:'funding-rate',instId:CFG.instId}
  ]}));render()};
  ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(!m.data)return;const ch=m.arg&&m.arg.channel;const d=m.data[0];S.lastWs=Date.now();
    if(ch==='tickers'){updatePrice(+d.last);S.mark=+d.markPx;S.volume=+d.vol24h}
    else if(ch==='open-interest')updateOi(d)
    else if(ch==='books5')updateBook(m.data)
    else if(ch==='funding-rate'){S.funding=+d.fundingRate;S.dataFlags.funding=true}
    else if(ch==='trades'){for(const t of m.data){const v=(+t.px)*(+t.sz);if(t.side==='buy')S.tradeFlow.buy+=v;else S.tradeFlow.sell+=v}const total=S.tradeFlow.buy+S.tradeFlow.sell;if(total>0){S.taker=S.tradeFlow.buy/total;S.dataFlags.taker=true}}
    analyse();render();
  }catch(err){}}
  ws.onerror=()=>{S.wsConnected=false;set('wsStatus','REST 备用');render()};
  ws.onclose=()=>{S.wsConnected=false;set('wsStatus','REST 备用');render();setTimeout(()=>{if(S.ws===ws)connectWS()},3000)};
}
function latestPair(rows){if(!Array.isArray(rows)||!rows.length)return null;const arr=rows.filter(Array.isArray).map(r=>({ts:+r[0],a:+r[1],b:r[2]!=null?+r[2]:null})).filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.a));arr.sort((x,y)=>y.ts-x.ts);return arr[0]||null}
async function loadRubik(){
  const ls=await api(`/api/v5/rubik/stat/contracts/long-short-account-ratio-contract?instId=${CFG.instId}&period=5m`);const lr=latestPair(ls);if(lr){S.ratio=lr.a;S.dataFlags.ratio=true}
  const tv=await api(`/api/v5/rubik/stat/taker-volume-contract?instId=${CFG.instId}&period=5m`);const tr=latestPair(tv);if(tr&&tr.b!=null){S.taker=tr.a/(tr.a+tr.b||1);S.dataFlags.taker=true}
}
async function restFallback(){
  if(S.wsConnected&&Date.now()-S.lastWs<8000)return;
  try{const [tick,oi,fund,books]=await Promise.all([api(`/api/v5/market/ticker?instId=${CFG.instId}`),api(`/api/v5/public/open-interest?instType=SWAP&instId=${CFG.instId}`),api(`/api/v5/public/funding-rate?instId=${CFG.instId}`),api(`/api/v5/market/books?instId=${CFG.instId}&sz=20`)]);updatePrice(+tick[0].last);S.mark=+tick[0].markPx;S.volume=+tick[0].vol24h;updateOi(oi[0]);S.funding=+fund[0].fundingRate;S.dataFlags.funding=true;updateBook(books);$('dataStatus').textContent='已连接：OKX REST 备用真实行情';analyse()}catch(e){if(!S.wsConnected)$('dataStatus').textContent='真实数据连接失败：'+e.message+'（未使用随机数据）'}}
async function loadSlow(){try{await Promise.all(['15m','30m','1H'].map(loadCandles));S.dataFlags.candles=true;analyse()}catch(e){S.dataFlags.candles=false}try{await loadRubik();analyse()}catch(e){S.dataFlags.ratio=false;S.dataFlags.taker=S.taker!=null;render()}}
function startTimers(){clearInterval(S.timers.rest);clearInterval(S.timers.slow);clearInterval(S.timers.candle);S.timers.rest=setInterval(restFallback,CFG.restPollMs);S.timers.slow=setInterval(loadRubik,CFG.rubikPollMs);S.timers.candle=setInterval(async()=>{try{await Promise.all(['15m','30m','1H'].map(loadCandles));S.dataFlags.candles=true;analyse()}catch(e){}},CFG.candlePollMs)}
async function boot(){connectWS();await restFallback();await loadSlow();startTimers();render()}
$('start').onclick=()=>{if(S.running)return;S.running=true;$('status').textContent='当前：V3 自动模拟运行中；行情优先使用 OKX WebSocket 实时数据。';log('启动 V3：真实行情 + 模拟撮合。不会发送真实订单。');simulate()};
$('stop').onclick=()=>{S.running=false;$('status').textContent='当前：已停止';log('停止自动模拟。')};
$('reset').onclick=()=>{S.equity=CFG.equity0;S.pool=CFG.pool0;S.pnl=0;S.lossStreak=0;S.position=null;S.entry=null;S.positionNotional=0;S.logs=[];log('模拟账户重置：$10,000 / 策略池 $3,000');render()};
setInterval(()=>{if(S.running)simulate()},1000);
render();boot();
