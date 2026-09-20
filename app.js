const WS="wss://ws.okx.com:8443/ws/v5/public";
const REST="https://www.okx.com";
const INST="BTC-USDT-SWAP";
const TF={"1m":"1m","5m":"5m","15m":"15m","30m":"30m","1H":"1H"};
const STORAGE={trades:"btc32_v19_trades",cash:"btc32_v19_cash",reserved:"btc32_v19_reserved",pos:"btc32_v19_pos",initialized:"btc32_v19_initialized",snapshot:"btc32_v19_snapshot"};
const DB_NAME="btc32_persistence_v19";const DB_STORE="snapshots";const DB_KEY="account";const CACHE_NAME="btc-v3-persistent-account-v19";const CACHE_KEY="./.btc-v3-account-backup-v19.json";const OLD_CACHE_NAMES=[];
const OLD_DB_NAMES=[];
function openDB(){return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(new Error("IndexedDB unavailable"));const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error("IndexedDB open failed"))})}
async function idbPut(snapshot){try{const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readwrite");tx.objectStore(DB_STORE).put(snapshot,DB_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("IndexedDB write failed"))});db.close()}catch(e){}}
async function idbGet(){try{const db=await openDB();const v=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readonly");const r=tx.objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error||new Error("IndexedDB read failed"))});db.close();return v}catch(e){return null}}
async function idbGetFrom(name){try{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(!db.objectStoreNames.contains(DB_STORE)){db.close();return null}const v=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readonly");const r=tx.objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});db.close();return v}catch(e){return null}}
async function cachePut(snapshot){try{if(!window.caches)return;const c=await caches.open(CACHE_NAME);await c.put(CACHE_KEY,new Response(JSON.stringify(snapshot),{headers:{"Content-Type":"application/json"}}))}catch(e){}}
async function cacheGet(){try{if(!window.caches)return null;for(const name of [CACHE_NAME,...OLD_CACHE_NAMES]){const c=await caches.open(name);const key=name===CACHE_NAME?CACHE_KEY:"./.btc-v3-account-backup-v14.json";const r=await c.match(key);if(r){const x=await r.json();if(x)return x}}return null}catch(e){return null}}
async function requestPersistentStorage(){try{if(navigator.storage?.persist){await navigator.storage.persist()}}catch(e){}}
const state={price:0,markPx:0,bidPx:0,askPx:0,open24h:0,oi:0,funding:0,nextFundingTime:0,vol:0,flowHistory:[],oiHistory:[],priceHistory:[],candles:{},auto:true,pos:null,trades:[],cash:1000,startingCash:1000,reservedMargin:0,pool:1000,ctVal:0.01,ctMult:1,lotSz:1,tickSz:0.1,contractValueCcy:"BTC",takerFee:0.0005,lastSignal:"观望",lastScore:0,lastReason:"",lastTrade:0,ws:null,ready:false,lastFundingApplied:0,fundingAppliedIds:new Set(),book:{bids:[],asks:[]},fresh:{ticker:0,mark:0,oi:0,funding:0,book:0,trades:0,candles:{}},haltReason:"",closing:false};
const SIM_MMR=0.005; // 模拟维持保证金率；OKX实际强平价还会受风险档位/账户规则影响
const $=id=>document.getElementById(id);
function fmt(n,d=2){return Number.isFinite(n)?Number(n).toLocaleString("en-US",{maximumFractionDigits:d}):"--"}
function pct(n,d=2){return Number.isFinite(n)?(n*100).toFixed(d)+"%":"--"}
function setSignal(el,s){el.textContent=s;el.dataset.s=s}
function ema(a,n){if(!a.length)return 0;let k=2/(n+1),e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a,n=14){if(a.length<n+1)return 50;let g=0,l=0;for(let i=a.length-n;i<a.length;i++){let d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
function sma(a,n){if(a.length<n)return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;return a.slice(-n).reduce((x,y)=>x+y,0)/n}
function std(a,n){if(!a.length)return 0;let x=a.slice(-n),m=sma(x,n);return Math.sqrt(x.reduce((s,v)=>s+(v-m)**2,0)/x.length)}
function atr(rows,n=14){if(rows.length<n+1)return 0;let tr=[];for(let i=1;i<rows.length;i++){let h=+rows[i][2],l=+rows[i][3],pc=+rows[i-1][4];tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return sma(tr,n)}
function indicators(arr){let c=arr.map(x=>+x[4]),e20=ema(c,20),e60=ema(c,60),r=rsi(c,14),m12=ema(c,12),m26=ema(c,26),dif=m12-m26,dea=ema(c.map((_,i)=>ema(c.slice(0,i+1),12)-ema(c.slice(0,i+1),26)),9),hist=dif-dea,mid=sma(c,20),sd=std(c,20),up=mid+2*sd,lo=mid-2*sd;return {last:c.at(-1)||0,e20,e60,r,dif,dea,hist,mid,up,lo,band:mid?((up-lo)/mid):0,atr:atr(arr)}}
function scoreFrame(arr){if(arr.length<60)return {score:0,signal:"等待",reason:"历史K线不足"};let z=indicators(arr),s=0;s+=z.last>z.e20?1:-1;s+=z.last>z.e60?1:-1;s+=z.e20>z.e60?1:-1;s+=z.r>55?1:z.r<45?-1:0;s+=z.dif>z.dea?1:-1;if(z.last>z.up)s-=1;if(z.last<z.lo)s+=1;return {score:s,signal:s>=3?"偏多":s<=-3?"偏空":"观望",ind:z}}
function priceChange(ms=1000){let now=Date.now(),old=state.priceHistory.find(x=>now-x.t>=ms);return old&&old.v?state.price/old.v-1:0}
function rateOI(ms){let now=Date.now(),old=state.oiHistory.find(x=>now-x.t>=ms);return old&&old.v?state.oi/old.v-1:0}
function flowRatio(){let now=Date.now(),cut=now-60000,a=state.flowHistory.filter(x=>x.t>=cut);if(!a.length)return null;let b=a.reduce((s,x)=>s+x.b,0),v=a.reduce((s,x)=>s+x.b+x.s,0);return v?b/v:null}
function aggregate(){let weights={"1m":1,"5m":2,"15m":3,"30m":3,"1H":4},total=0,ws=0,parts=[];for(const k of Object.keys(TF)){let a=state.candles[k]||[],r=scoreFrame(a);if(r.signal!=="等待"){total+=r.score*weights[k];ws+=weights[k];parts.push(`${k}${r.score>0?"多":"空"}`)}}let trend=ws?total/ws:0,oi1=rateOI(60000),oi5=rateOI(300000),flow=flowRatio(),pc1=priceChange(60000);let score=trend;if(oi1>0.001&&pc1>0.0003)score+=1;if(oi1>0.001&&pc1<-0.0003)score-=1;if(oi1<-0.001&&pc1>0.0003)score-=0.5;if(oi1<-0.001&&pc1<-0.0003)score+=0.5;if(flow!=null){if(flow>0.58)score+=1;if(flow<0.42)score-=1}if(state.funding>0.0003&&trend<0)score-=0.5;if(state.funding<-0.0003&&trend>0)score+=0.5;let signal=score>=2.2?"偏多":score<=-2.2?"偏空":"观望";let reason=`多周期:${parts.join("/")||"等待"}；OI 1m ${pct(oi1)}；价格1m ${pct(pc1)}；主动买卖 ${flow==null?"等待":(flow*100).toFixed(0)+"%买"}；综合分 ${score.toFixed(2)}`;return {score,signal,reason,trend,oi1,oi5,flow,pc1}}
function liquidationPrice(){
 if(!state.pos)return null;
 const p=state.pos, q=p.contracts*state.ctVal*state.ctMult;
 if(!(q>0))return null;
 const baseEquity=state.cash+(state.reservedMargin||0);
 const costRate=SIM_MMR+state.takerFee;
 if(p.side==='多'){
   const den=q*(1-costRate);
   if(!(den>0))return null;
   return roundPx((p.entry*q-baseEquity)/den);
 }
 const den=q*(1+costRate);
 return roundPx((p.entry*q+baseEquity)/den);
}
function liquidationDistance(){
 const liq=liquidationPrice();
 if(!(liq>0))return null;
 const mark=state.markPx||state.price;
 if(!(mark>0))return null;
 return state.pos.side==='多'?(mark-liq)/mark:(liq-mark)/mark;
}
function liquidationRisk(){
 const d=liquidationDistance();
 if(d==null)return '未知';
 if(d<=0)return '已触及模拟强平';
 if(d<0.03)return '高风险';
 if(d<0.08)return '中风险';
 return '安全区';
}
function updateLiquidationUI(){
 const liq=liquidationPrice(),d=liquidationDistance();
 const el=$('liqPrice'),de=$('liqDistance'),ri=$('liqRisk');
 if(!state.pos){if(el)el.textContent='--';if(de)de.textContent='--';if(ri)ri.textContent='--';return}
 if(el)el.textContent=liq?`$${fmt(liq,1)}`:'--';
 if(de)de.textContent=d==null?'--':pct(d,2);
 if(ri)ri.textContent=liquidationRisk();
}

function updateUI(){
 $("price").textContent=fmt(state.price,1);$("change").textContent=state.open24h?pct(state.price/state.open24h-1,2):"--";
 $("oi").textContent=state.oi?fmt(state.oi,2)+" BTC":"--";$("oiChg").textContent=pct(rateOI(60000));
 $("oiSpeed").textContent=pct(rateOI(10000));$("oi5m").textContent=pct(rateOI(300000));$("funding").textContent=pct(state.funding,4);$("vol").textContent=state.vol&&state.price?"$"+fmt((state.vol*state.price)/1e9,2)+"B":"--";
 for(const [k,id] of [["1m","s1"],["5m","s5"],["15m","s15"],["30m","s30"],["1H","s60"]])setSignal($(id),scoreFrame(state.candles[k]||[]).signal);
 let arr=state.candles["15m"]||[],z=indicators(arr),ag=aggregate();$("ema20").textContent=fmt(z.e20,1);$("ema60").textContent=fmt(z.e60,1);$("rsi").textContent=fmt(z.r,1);$("macd").textContent=fmt(z.hist,1);$("bb").textContent=z.mid?`${fmt(z.lo,1)} / ${fmt(z.mid,1)} / ${fmt(z.up,1)}`:"--";
 let fr=flowRatio();$("flow").textContent=fr==null?"等待":(fr*100).toFixed(0)+"%买 / "+((1-fr)*100).toFixed(0)+"%卖";
 state.lastSignal=ag.signal;state.lastScore=ag.score;state.lastReason=ag.reason;$("direction").textContent=ag.signal;$("reason").textContent=ag.reason;
 state.pool=state.cash;$("cash").textContent="$"+fmt(state.cash,2);$("pool").textContent="$"+fmt(state.pool,2);$("balance").textContent="$"+fmt(equity(),2);renderAccountStats();
 if(state.pos){let p=state.pos,upnl=unrealized();$("upnl").textContent="$"+fmt(upnl,2);$("pos").textContent=`${p.side} / ${p.leverage}x / ${p.mode} / 保证金 $${fmt(p.margin,2)} / ${fmt(p.contracts,0)}张 / 开仓 $${fmt(p.entry,1)} / 标记 $${fmt(state.markPx||state.price,1)}`}else{$("upnl").textContent="--";$("pos").textContent="无"}
 updateLiquidationUI()
}
function unrealized(){if(!state.pos)return 0;let p=state.pos,mark=state.markPx||state.price,dir=p.side==="多"?1:-1;return (mark-p.entry)*dir*p.contracts*state.ctVal*state.ctMult}
function equity(){return state.cash+state.reservedMargin+unrealized()}
function availableCash(){return state.cash}
function snapshot(){return {version:19,savedAt:Date.now(),trades:state.trades.slice(),cash:state.cash,reservedMargin:state.reservedMargin,pos:state.pos,lastTrade:Number(state.lastTrade)||0,lastFundingApplied:Number(state.lastFundingApplied)||0}}
function saveLocalSync(snap){try{const raw=JSON.stringify(snap);localStorage.setItem(STORAGE.trades,JSON.stringify(snap.trades));localStorage.setItem(STORAGE.cash,String(snap.cash));localStorage.setItem(STORAGE.reserved,String(snap.reservedMargin));localStorage.setItem(STORAGE.pos,JSON.stringify(snap.pos));localStorage.setItem(STORAGE.snapshot,raw);localStorage.setItem(STORAGE.initialized,"1")}catch(e){}}
function save(){const snap=snapshot();state.lastSavedAt=snap.savedAt;saveLocalSync(snap);void idbPut(snap);void cachePut(snap)}
function dataReadyForTrading(){
 const now=Date.now();
 const stale=(k,ms)=>!state.fresh[k]||now-state.fresh[k]>ms;
 const candleFresh=["1m","5m","15m","30m","1H"].every(k=>{const t=state.fresh.candles[k]||0;return t&&now-t<90000});
 if(stale("ticker",5000)||stale("mark",5000)||stale("oi",8000)||stale("funding",90000)||stale("book",3000)||stale("trades",5000)||!candleFresh){state.haltReason="核心行情数据未及时更新，暂停新开仓";return false}
 state.haltReason="";return true;
}
function adaptiveEntryAllowed(ag){
 if(!dataReadyForTrading())return false;
 if(Math.abs(ag.score)<2.8)return false;
 const aligned=["1m","5m","15m"].map(k=>scoreFrame(state.candles[k]||[]).signal);
 const side=ag.signal==="偏多"?"偏多":"偏空";
 const alignedCount=aligned.filter(x=>x===side).length;
 if(alignedCount<2){state.haltReason="短周期未形成同向确认，暂停新开仓";return false}
 if(ag.flow!=null && ((side==="偏多"&&ag.flow<0.52)||(side==="偏空"&&ag.flow>0.48))){state.haltReason="主动成交未支持当前方向，暂停新开仓";return false}
 if(Math.abs(ag.oi1)>0.02){state.haltReason="OI短时异常波动，等待确认";return false}
 return true;
}
function renderAccountStats(){
 const closed=state.trades.filter(x=>Number.isFinite(Number(x.pnl)));
 const totalPnl=closed.reduce((s,x)=>s+Number(x.pnl||0),0);
 const wins=closed.filter(x=>x.pnl>0).length,losses=closed.filter(x=>x.pnl<0).length;
 const winRate=closed.length?wins/closed.length:0;
 const maxWin=closed.length?Math.max(...closed.map(x=>Number(x.pnl||0))):0;
 const maxLoss=closed.length?Math.min(...closed.map(x=>Number(x.pnl||0))):0;
 let peak=state.startingCash,dd=0,eq=state.startingCash;
 for(const x of closed){eq=Number(x.balanceAfter??eq);peak=Math.max(peak,eq);dd=Math.max(dd,(peak-eq)/peak);}
 if($("totalTrades"))$("totalTrades").textContent=String(state.trades.length);
 if($("totalPnl"))$("totalPnl").textContent="$"+fmt(totalPnl,2);
 if($("returnRate"))$("returnRate").textContent=pct(state.startingCash?totalPnl/state.startingCash:0,2);
 if($("winRate"))$("winRate").textContent=pct(winRate,2);
 if($("winLoss"))$("winLoss").textContent=`${wins} / ${losses}`;
 if($("maxWin"))$("maxWin").textContent="$"+fmt(maxWin,2);
 if($("maxLoss"))$("maxLoss").textContent="$"+fmt(maxLoss,2);
 if($("maxDD"))$("maxDD").textContent=pct(dd,2);
}
function renderAuto(){const b=$("auto");if(!b)return;if(state.auto){b.textContent=state.haltReason?"自动运行 · 暂停新开仓":"自动运行中";b.className=state.haltReason?"on off":"on"}else{b.textContent="恢复自动交易";b.className="on off"}}
function storageStatus(){const el=$("storageStatus");if(el){const t=state.lastSavedAt?new Date(state.lastSavedAt).toLocaleTimeString():"--";el.textContent=`本机记录已保存：${t}；交易 ${state.trades.length} 笔`;}const c=$("tradeCount");if(c)c.textContent=`（共 ${state.trades.length} 笔，全部显示）`; }
function applySnapshot(snap){if(!snap||!Array.isArray(snap.trades)||!Number.isFinite(Number(snap.cash))||!Number.isFinite(Number(snap.reservedMargin)))return false;state.trades=snap.trades;state.cash=Number(snap.cash);state.reservedMargin=Number(snap.reservedMargin);state.pos=snap.pos||null;state.lastSavedAt=Number(snap.savedAt)||0;state.pool=Math.max(0,state.cash);return true}
async function load(){
  // V19 uses a completely separate persistence namespace. Legacy V14/V16/V17
  // account data is intentionally not imported because it can contain the wrong seed.
  let snap=null;
  try{const raw=localStorage.getItem(STORAGE.snapshot);if(raw)snap=JSON.parse(raw)}catch(e){}
  if(!snap){try{snap=await idbGet()}catch(e){}}
  if(!snap){try{snap=await cacheGet()}catch(e){}}
  if(snap&&Array.isArray(snap.trades)&&Number.isFinite(Number(snap.cash))&&Number.isFinite(Number(snap.reservedMargin))){
    state.trades=snap.trades;state.cash=Number(snap.cash);state.reservedMargin=Number(snap.reservedMargin);state.pos=snap.pos||null;state.lastTrade=Number(snap.lastTrade)||0;state.lastFundingApplied=Number(snap.lastFundingApplied)||0;state.pool=state.cash;
  }else{
    state.trades=[];state.cash=1000;state.startingCash=1000;state.reservedMargin=0;state.pool=1000;state.pos=null;state.lastTrade=0;state.lastFundingApplied=0;save();
  }
  state.startingCash=1000;state.auto=true;renderTrades();renderAuto();renderAccountStats();storageStatus();await requestPersistentStorage();
}
setInterval(()=>{if(state.ready){save();storageStatus()}},5000);
function pushTrade(trade){
 state.trades.push(trade);
}
function renderTrades(){
 const rows=state.trades.slice().reverse().map(x=>`<tr>
 <td>${x.orderId||x.id||"--"}</td><td>${x.openTime||x.time||"--"}</td><td>${x.closeTime||"--"}</td>
 <td>${x.side||"--"}</td><td>${x.entry!=null?fmt(x.entry,1):"--"}</td><td>${x.exit!=null?fmt(x.exit,1):"持仓中"}</td>
 <td>${x.leverage||"--"}x</td><td>${x.mode||"全仓"}</td><td>$${fmt(x.margin,2)}</td>
 <td>${fmt(x.contracts,0)}张</td><td>$${fmt(x.notional,2)}</td><td>${x.holdingSeconds==null?"--":x.holdingSeconds+"s"}</td>
 <td>${x.pnl==null?"--":"$"+fmt(x.pnl,2)}</td><td>${x.returnPct==null?"--":pct(x.returnPct,2)}</td>
 <td>${x.balanceAfter==null?"--":"$"+fmt(x.balanceAfter,2)}</td><td>${x.reason||""}</td></tr>`).join("");
 $("trades").innerHTML=rows;
}
function updateOpenTrade(reason=""){if(!state.pos)return;let t=state.trades.find(x=>x.id===state.pos.tradeId);if(!t)return;t.exit=null;t.pnl=null;t.fee=state.pos.entryFee;t.balanceAfter=equity();t.reason=reason||t.reason;renderTrades();save();storageStatus()}
function positionPlan(score){
 let a=Math.abs(score);
 if(a<2.8)return {margin:0,leverage:0,level:'不足以开仓'};
 const leverage=a<3.8?10:20;
 const feeBuffer=1+leverage*state.takerFee;
 const margin=Math.max(0,state.cash/feeBuffer);
 return leverage===10?{margin,leverage,level:'确认/10x'}:{margin,leverage,level:'强信号/20x'};
}
function floorLot(n){return Math.floor(n/state.lotSz)*state.lotSz}
function roundPx(n){return Math.round(n/state.tickSz)*state.tickSz}
function marketFill(side,contracts){
 let levels=side==='多'?state.book.asks:state.book.bids;if(!levels.length)return null;
 let need=contracts,filled=0,cost=0;
 for(const [px0,sz0] of levels){let px=+px0,sz=+sz0;if(!(px>0&&sz>0))continue;let take=Math.min(need,sz);cost+=take*px*state.ctVal*state.ctMult;filled+=take;need-=take;if(need<=1e-12)break;}
 if(filled+1e-12<contracts)return null;
 return {price:roundPx(cost/(filled*state.ctVal*state.ctMult)),contracts:filled,notional:cost};
}
function openPos(side){
 if(state.pos||!state.auto||!state.price)return;
 let plan=positionPlan(state.lastScore); if(!plan.margin)return;
 let leverage=plan.leverage;
 // Reserve enough cash for both margin and the leveraged entry fee.
 let feeBuffer=1+leverage*state.takerFee;
 let margin=state.cash/feeBuffer; if(margin<10)return;
 let targetNotional=margin*leverage;
 let ref=side==='多'?(state.askPx||state.price):(state.bidPx||state.price);
 let contracts=floorLot(targetNotional/(ref*state.ctVal*state.ctMult)); if(contracts<state.lotSz)return;
 let fill=marketFill(side,contracts); if(!fill)return;
 contracts=floorLot(fill.contracts); if(contracts<state.lotSz)return;
 let entry=fill.price,notional=fill.notional,fee=notional*state.takerFee;
 if(margin+fee>state.cash)return;
 let now=Date.now(),before=state.cash+state.reservedMargin+unrealized();
 state.cash-=margin+fee; state.reservedMargin+=margin;
 const id=Date.now()+'-'+Math.random().toString(36).slice(2,8);
 state.pos={tradeId:id,side,entry,margin,marginBalance:margin,leverage,mode:'全仓',contracts,opened:now,
   openScore:state.lastScore,entryFee:fee,entryFunding:0,fundingPaid:0,peakMove:0,maxFavorable:0,maxAdverse:0,simMmr:SIM_MMR};
 pushTrade({id,orderId:id,status:'OPEN',time:new Date(now).toLocaleString(),openedAt:now,
   openTime:new Date(now).toLocaleString(),closeTime:null,side,entry,exit:null,leverage,mode:'全仓',
   margin,contracts,quantityBTC:contracts*state.ctVal*state.ctMult,notional,entryNotional:notional,
   exitNotional:null,pnl:null,grossPnl:null,fee,openFee:fee,closeFee:0,fundingFee:0,
   balanceBefore:before,equityBefore:before,balanceAfter:null,equityAfter:null,returnPct:null,
   holdingSeconds:null,maxFavorable:0,maxAdverse:0,
   reason:`${state.lastReason}；${plan.level}（综合分 ${state.lastScore.toFixed(2)}）；全仓 ${leverage}x；OKX盘口吃单模拟成交；名义价值 $${fmt(notional,2)}；开仓手续费 $${fmt(fee,2)}`,
   entrySnapshot:{score:state.lastScore,signal:state.lastSignal,reason:state.lastReason,
     timeframes:Object.fromEntries(Object.keys(TF).map(k=>{const r=scoreFrame(state.candles[k]||[]);return [k,{signal:r.signal,score:r.score}]})),
     price:state.price,markPx:state.markPx,oi:state.oi,funding:state.funding,flow:flowRatio(),
     oi1:rateOI(60000),oi5:rateOI(300000),price1m:priceChange(60000),bidPx:state.bidPx,askPx:state.askPx,simMmr:SIM_MMR,estimatedLiquidationPrice:liquidationPrice()}});
 renderTrades();renderAccountStats();save();storageStatus();
}
async function applyFundingIfDue(){
 if(!state.pos||!state.nextFundingTime||Date.now()<state.nextFundingTime||state.lastFundingApplied>=state.nextFundingTime)return;
 const dueTime=state.nextFundingTime;
 let realized=null;
 try{
   const d=await getJSON(`/api/v5/public/funding-rate-history?instId=${INST}&limit=20`);
   const rows=(d||[]).filter(x=>+x.fundingTime<=dueTime+5000).sort((a,b)=>+b.fundingTime-+a.fundingTime);
   const hit=rows.find(x=>+x.fundingTime===dueTime)||rows[0];
   if(hit && Number.isFinite(+hit.realizedRate)) realized=+hit.realizedRate;
 }catch(e){}
 if(realized===null)return;
 const p=state.pos,mark=state.markPx||state.price,notional=mark*p.contracts*state.ctVal*state.ctMult,raw=notional*realized,fee=p.side==='多'?raw:-raw;
 p.marginBalance=(p.marginBalance??p.margin)-fee;
 state.reservedMargin+=(-fee);
 p.fundingPaid=(p.fundingPaid||0)+fee;
 state.lastFundingApplied=dueTime;
 let t=state.trades.find(x=>x.id===p.tradeId);
 if(t){t.fundingFee=(t.fundingFee||0)+fee;t.fundingRate=(t.fundingRate||0)+realized;t.fundingTime=dueTime;}
 // Fetch the next actual funding schedule after settlement.
 try{const n=await getJSON(`/api/v5/public/funding-rate?instId=${INST}`);if(n[0]){state.funding=+n[0].fundingRate||0;state.nextFundingTime=+n[0].nextFundingTime||0;}}catch(e){}
 save();
}
async function closePos(reason){
 if(!state.pos||state.closing)return;state.closing=true; await applyFundingIfDue();
 let p=state.pos,dir=p.side==="多"?1:-1,fill=marketFill(p.side==="多"?"空":"多",p.contracts); if(!fill){state.closing=false;return;}
 let now=Date.now(),exit=fill.price,mark=state.markPx||state.price;
 let gross=(exit-p.entry)*dir*p.contracts*state.ctVal*state.ctMult;
 let exitNotional=fill.notional,exitFee=exitNotional*state.takerFee,totalFee=p.entryFee+exitFee;
 let fundingFee=p.fundingPaid||0,pnl=gross-totalFee-fundingFee;
 state.reservedMargin=Math.max(0,state.reservedMargin-(p.marginBalance??p.margin));
 state.cash+=(p.marginBalance??p.margin)+gross-exitFee;
 let t=state.trades.find(x=>x.id===p.tradeId);
 if(t){t.status='CLOSED';t.exit=roundPx(exit);t.closedAt=now;t.closeTime=new Date(now).toLocaleString();
   t.exitNotional=exitNotional;t.grossPnl=gross;t.pnl=pnl;t.fee=totalFee;t.closeFee=exitFee;t.fundingFee=fundingFee;
   t.balanceAfter=state.cash;t.equityAfter=state.cash;t.returnPct=t.margin?pnl/t.margin:0;
   t.holdingSeconds=Math.round((now-p.opened)/1000);t.maxFavorable=p.maxFavorable||0;t.maxAdverse=p.maxAdverse||0;
   t.reason=`${reason}；持仓 ${t.holdingSeconds}s；毛盈亏 $${fmt(gross,2)}；手续费 $${fmt(totalFee,2)}；净盈亏 $${fmt(pnl,2)}`;
 }
 state.pos=null;state.lastTrade=now;state.pool=Math.max(0,state.cash);
 renderTrades();renderAccountStats();save();storageStatus();state.closing=false;
}
async function managePosition(){if(!state.pos||!state.price)return;await applyFundingIfDue();let p=state.pos,mark=state.markPx||state.price,dir=p.side==="多"?1:-1,move=(mark-p.entry)/p.entry*dir,ag=aggregate(),z=indicators(state.candles["15m"]||[]);let adverse=(p.side==="多"&&ag.signal==="偏空")||(p.side==="空"&&ag.signal==="偏多");let momentumFade=(p.side==="多"&&z.dif<z.dea&&z.r<48)||(p.side==="空"&&z.dif>z.dea&&z.r>52);let atrStop=z.atr&&Math.abs(mark-p.entry)>z.atr*2.2&&move<0;let peak=p.peakMove??move;p.peakMove=Math.max(peak,move);
 p.maxFavorable=Math.max(p.maxFavorable||0,move);
 p.maxAdverse=Math.min(p.maxAdverse||0,move);let trail=p.peakMove>0.012&&move<=p.peakMove-0.003;let hardRisk=p.margin>0&&move<-(Math.max(0.008,(z.atr/(mark||1)||0)*2.0));let liq=liquidationPrice();let liqHit=liq>0&&((p.side==="多"&&mark<=liq)||(p.side==="空"&&mark>=liq));updateOpenTrade(`持仓中；浮盈亏 $${fmt(unrealized(),2)}；峰值收益 ${(p.peakMove*100).toFixed(2)}%；预计强平价 $${fmt(liq,1)}`);if(liqHit)closePos("模拟强制平仓");else if(adverse&&Math.abs(ag.score)>3)closePos("综合方向反转");else if(momentumFade&&Math.abs(ag.score)>2)closePos("动能衰减");else if(atrStop||hardRisk)closePos("波动扩张且方向不利");else if(trail)closePos("盈利回撤保护")}
async function autoTrade(){if(!state.auto||!state.price||!state.ready)return;try{let ag=aggregate();state.lastSignal=ag.signal;if(!state.pos&&Date.now()-state.lastTrade>60000&&adaptiveEntryAllowed(ag)){openPos(ag.signal==="偏多"?"多":"空")}await managePosition();renderAuto()}catch(e){state.haltReason="交易引擎异常，已暂停新开仓："+(e?.message||"未知错误");renderAuto();save()}}
async function getJSON(path){let r=await fetch(REST+path,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);let j=await r.json();if(j.code!=="0")throw new Error(j.msg||"OKX error");return j.data}
async function loadHistory(){for(const [k,bar] of Object.entries(TF)){try{let d=await getJSON(`/api/v5/market/candles?instId=${INST}&bar=${bar}&limit=300`);let rows=d.map(x=>[+x[0],+x[1],+x[2],+x[3],+x[4],+x[5]]).reverse();state.candles[k]=rows}catch(e){state.candles[k]=[]}}
 try{let d=await getJSON(`/api/v5/market/ticker?instId=${INST}`);if(d[0]){state.price=+d[0].last;state.bidPx=+d[0].bidPx||state.price;state.askPx=+d[0].askPx||state.price;state.open24h=+d[0].open24h||state.price;state.vol=+d[0].volCcy24h||0;state.fresh.ticker=Date.now()}}catch(e){}
 try{let d=await getJSON(`/api/v5/public/mark-price?instType=SWAP&instId=${INST}`);if(d[0]){state.markPx=+d[0].markPx||state.price;state.fresh.mark=Date.now()}}catch(e){}
 try{let d=await getJSON(`/api/v5/public/open-interest?instType=SWAP&instId=${INST}`);if(d[0]){state.oi=+d[0].oiCcy||0;state.oiHistory.push({t:Date.now(),v:state.oi});state.fresh.oi=Date.now()}}catch(e){}
 try{let d=await getJSON(`/api/v5/public/funding-rate?instId=${INST}`);if(d[0]){state.funding=+d[0].fundingRate||0;state.nextFundingTime=+d[0].nextFundingTime||0;state.fresh.funding=Date.now()}}catch(e){}
 try{let d=await getJSON(`/api/v5/public/instruments?instType=SWAP&instId=${INST}`);if(d[0]){if(+d[0].ctVal>0)state.ctVal=+d[0].ctVal;if(+d[0].ctMult>0)state.ctMult=+d[0].ctMult;if(+d[0].lotSz>0)state.lotSz=+d[0].lotSz;if(+d[0].tickSz>0)state.tickSz=+d[0].tickSz}}catch(e){}
 for(const k of Object.keys(TF))if(state.candles[k]?.length)state.fresh.candles[k]=Date.now();state.ready=true;updateUI()}
function sub(ws,args){ws.send(JSON.stringify({op:"subscribe",args}))}
function applyBookUpdate(d){
 const side=(arr,key)=>{const m=new Map(state.book[key].map(x=>[x[0],x[1]]));for(const row of (arr||[])){const px=row[0],sz=row[1];if(+sz===0)m.delete(px);else m.set(px,sz)}state.book[key]=Array.from(m.entries()).sort((a,b)=>key==="bids"?(+b[0]-+a[0]):(+a[0]-+b[0]));};
 if(d.action==="snapshot"||!state.book.bids.length&&!state.book.asks.length){state.book={bids:d.bids||[],asks:d.asks||[]};return}
 side(d.bids,"bids");side(d.asks,"asks");
}
function connect(){const ws=new WebSocket(WS);state.ws=ws;ws.onopen=()=>{$("status").textContent="OKX 实时数据";sub(ws,[{channel:"tickers",instId:INST},{channel:"mark-price",instType:"SWAP",instId:INST},{channel:"open-interest",instType:"SWAP",instId:INST},{channel:"funding-rate",instId:INST},{channel:"trades",instId:INST},{channel:"books",instId:INST},...Object.values(TF).map(bar=>({channel:`candle${bar}`,instId:INST}))])};ws.onmessage=e=>{let m=JSON.parse(e.data);if(!m.data)return;let d=m.data[0],ch=m.arg?.channel;
 if(ch==="tickers"){state.price=+d.last;state.bidPx=+d.bidPx||state.price;state.askPx=+d.askPx||state.price;state.open24h=+d.open24h||state.open24h;state.vol=+d.volCcy24h||state.vol;state.fresh.ticker=Date.now();state.priceHistory.push({t:Date.now(),v:state.price});state.priceHistory=state.priceHistory.filter(x=>Date.now()-x.t<360000)}
 if(ch==="mark-price"){state.markPx=+d.markPx||state.price;state.fresh.mark=Date.now()}
 if(ch==="open-interest"){state.oi=+d.oiCcy||0;state.fresh.oi=Date.now();state.oiHistory.push({t:Date.now(),v:state.oi});state.oiHistory=state.oiHistory.filter(x=>Date.now()-x.t<360000)}
 if(ch==="funding-rate"){state.funding=+d.fundingRate||0;state.fresh.funding=Date.now();state.nextFundingTime=+d.nextFundingTime||state.nextFundingTime}
 if(ch==="books"){applyBookUpdate(d);state.fresh.book=Date.now()}
 if(ch==="trades"){let px=+d.px,sz=+d.sz,side=d.side;state.fresh.trades=Date.now();state.flowHistory.push({t:Date.now(),b:side==="buy"?sz:0,s:side==="sell"?sz:0,px});state.flowHistory=state.flowHistory.filter(x=>Date.now()-x.t<300000)}
 if(ch?.startsWith("candle")){let key=ch.replace("candle","");state.fresh.candles[key]=Date.now();state.candles[key]??=[];let x=d,xr=[+x[0],+x[1],+x[2],+x[3],+x[4],+x[5]];let a=state.candles[key];if(a.length&&a.at(-1)[0]===xr[0])a[a.length-1]=xr;else a.push(xr);if(a.length>300)a.shift()}
 updateUI();autoTrade()};ws.onclose=()=>{$("status").textContent="断线，重连中…";setTimeout(connect,2000)};ws.onerror=()=>ws.close()}
window.addEventListener("pagehide",()=>save());window.addEventListener("beforeunload",()=>save());document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")save()});
$("auto").onclick=()=>{state.auto=!state.auto;renderAuto();if(!state.auto){/* 暂停仅阻止新开仓，不强制平仓 */}};
load().then(()=>loadHistory()).then(connect).catch(()=>{state.ready=true;connect()});setInterval(()=>{updateUI();autoTrade()},1000);
