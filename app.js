const WS="wss://ws.okx.com:8443/ws/v5/public";
const REST="https://www.okx.com";
const INST="BTC-USDT-SWAP";
const TF={"1m":"1m","5m":"5m","15m":"15m","30m":"30m","1H":"1H"};
const STORAGE={trades:"btc32_v5_trades",cash:"btc32_v5_cash",reserved:"btc32_v5_reserved",pos:"btc32_v5_pos",initialized:"btc32_v5_initialized",snapshot:"btc32_v5_snapshot"};
const DB_NAME="btc32_persistence_v13";const DB_STORE="snapshots";const DB_KEY="account";const CACHE_NAME="btc-v3-persistent-account-v13";const CACHE_KEY="./.btc-v3-account-backup-v13.json";const OLD_CACHE_NAMES=["btc-v3-persistent-account-v12"];
const OLD_DB_NAMES=["btc32_persistence","btc32_v11_persistence","btc32_v9_persistence","btc32_v8_persistence","btc32_v7_persistence"];
function openDB(){return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(new Error("IndexedDB unavailable"));const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error("IndexedDB open failed"))})}
async function idbPut(snapshot){try{const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readwrite");tx.objectStore(DB_STORE).put(snapshot,DB_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("IndexedDB write failed"))});db.close()}catch(e){}}
async function idbGet(){try{const db=await openDB();const v=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readonly");const r=tx.objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error||new Error("IndexedDB read failed"))});db.close();return v}catch(e){return null}}
async function idbGetFrom(name){try{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(!db.objectStoreNames.contains(DB_STORE)){db.close();return null}const v=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readonly");const r=tx.objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});db.close();return v}catch(e){return null}}
async function cachePut(snapshot){try{if(!window.caches)return;const c=await caches.open(CACHE_NAME);await c.put(CACHE_KEY,new Response(JSON.stringify(snapshot),{headers:{"Content-Type":"application/json"}}))}catch(e){}}
async function cacheGet(){try{if(!window.caches)return null;for(const name of [CACHE_NAME,...OLD_CACHE_NAMES]){const c=await caches.open(name);const key=name===CACHE_NAME?CACHE_KEY:"./.btc-v3-account-backup-v12.json";const r=await c.match(key);if(r){const x=await r.json();if(x)return x}}return null}catch(e){return null}}
async function requestPersistentStorage(){try{if(navigator.storage?.persist){await navigator.storage.persist()}}catch(e){}}
const state={price:0,markPx:0,bidPx:0,askPx:0,open24h:0,oi:0,funding:0,nextFundingTime:0,vol:0,flowHistory:[],oiHistory:[],priceHistory:[],candles:{},auto:false,pos:null,trades:[],cash:10000,startingCash:10000,reservedMargin:0,pool:3000,ctVal:0.01,ctMult:1,lotSz:1,tickSz:0.1,contractValueCcy:"BTC",takerFee:0.0005,lastSignal:"观望",lastScore:0,lastReason:"",lastTrade:0,ws:null,ready:false,lastFundingApplied:0,fundingAppliedIds:new Set(),book:{bids:[],asks:[]}};
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
function updateUI(){
 $("price").textContent=fmt(state.price,1);$("change").textContent=state.open24h?pct(state.price/state.open24h-1,2):"--";
 $("oi").textContent=state.oi?fmt(state.oi,2)+" BTC":"--";$("oiChg").textContent=pct(rateOI(60000));
 $("oiSpeed").textContent=pct(rateOI(10000));$("oi5m").textContent=pct(rateOI(300000));$("funding").textContent=pct(state.funding,4);$("vol").textContent=state.vol&&state.price?"$"+fmt((state.vol*state.price)/1e9,2)+"B":"--";
 for(const [k,id] of [["1m","s1"],["5m","s5"],["15m","s15"],["30m","s30"],["1H","s60"]])setSignal($(id),scoreFrame(state.candles[k]||[]).signal);
 let arr=state.candles["15m"]||[],z=indicators(arr),ag=aggregate();$("ema20").textContent=fmt(z.e20,1);$("ema60").textContent=fmt(z.e60,1);$("rsi").textContent=fmt(z.r,1);$("macd").textContent=fmt(z.hist,1);$("bb").textContent=z.mid?`${fmt(z.lo,1)} / ${fmt(z.mid,1)} / ${fmt(z.up,1)}`:"--";
 let fr=flowRatio();$("flow").textContent=fr==null?"等待":(fr*100).toFixed(0)+"%买 / "+((1-fr)*100).toFixed(0)+"%卖";
 state.lastSignal=ag.signal;state.lastScore=ag.score;state.lastReason=ag.reason;$("direction").textContent=ag.signal;$("reason").textContent=ag.reason;
 $("cash").textContent="$"+fmt(state.cash,2);$("pool").textContent="$"+fmt(state.pool,2);$("balance").textContent="$"+fmt(equity(),2);
 if(state.pos){let p=state.pos,upnl=unrealized();$("upnl").textContent="$"+fmt(upnl,2);$("pos").textContent=`${p.side} / ${p.leverage}x / ${p.mode} / 保证金 $${fmt(p.margin,2)} / ${fmt(p.contracts,0)}张 / 开仓 $${fmt(p.entry,1)} / 标记 $${fmt(state.markPx||state.price,1)}`}else{$("upnl").textContent="--";$("pos").textContent="无"}
}
function unrealized(){if(!state.pos)return 0;let p=state.pos,mark=state.markPx||state.price,dir=p.side==="多"?1:-1;return (mark-p.entry)*dir*p.contracts*state.ctVal*state.ctMult}
function equity(){return state.cash+state.reservedMargin+unrealized()}
function availableCash(){return state.cash}
function snapshot(){return {version:13,savedAt:Date.now(),trades:state.trades.slice(),cash:state.cash,reservedMargin:state.reservedMargin,pos:state.pos}}
function saveLocalSync(snap){try{const raw=JSON.stringify(snap);localStorage.setItem(STORAGE.trades,JSON.stringify(snap.trades));localStorage.setItem(STORAGE.cash,String(snap.cash));localStorage.setItem(STORAGE.reserved,String(snap.reservedMargin));localStorage.setItem(STORAGE.pos,JSON.stringify(snap.pos));localStorage.setItem(STORAGE.snapshot,raw);localStorage.setItem("btc32_v13_snapshot_backup",raw);localStorage.setItem(STORAGE.initialized,"1")}catch(e){}}
function save(){const snap=snapshot();state.lastSavedAt=snap.savedAt;saveLocalSync(snap);void idbPut(snap);void cachePut(snap)}
function renderAuto(){const b=$("auto");if(!b)return;b.textContent=state.auto?"关闭":"开启";b.className=state.auto?"on":"on off"}
function storageStatus(){const el=$("storageStatus");if(el){const t=state.lastSavedAt?new Date(state.lastSavedAt).toLocaleTimeString():"--";el.textContent=`本机记录已保存：${t}；交易 ${state.trades.length} 笔`;}const c=$("tradeCount");if(c)c.textContent=`（共 ${state.trades.length} 笔，全部显示）`; }
function applySnapshot(snap){if(!snap||!Array.isArray(snap.trades)||!Number.isFinite(Number(snap.cash))||!Number.isFinite(Number(snap.reservedMargin)))return false;state.trades=snap.trades;state.cash=Number(snap.cash);state.reservedMargin=Number(snap.reservedMargin);state.pos=snap.pos||null;state.lastSavedAt=Number(snap.savedAt)||0;state.pool=Math.min(3000,Math.max(0,state.cash*0.3));return true}
async function load(){
 let candidates=[];
 void requestPersistentStorage();
 try{for(const key of [STORAGE.snapshot,"btc32_v13_snapshot_backup"]){const raw=localStorage.getItem(key);if(raw){const x=JSON.parse(raw);if(x&&Array.isArray(x.trades)&&Number.isFinite(Number(x.cash))&&Number.isFinite(Number(x.reservedMargin)))candidates.push(x)}}}catch(e){}
 try{const x=await idbGet();if(x&&Array.isArray(x.trades)&&Number.isFinite(Number(x.cash))&&Number.isFinite(Number(x.reservedMargin)))candidates.push(x)}catch(e){}
 for(const name of OLD_DB_NAMES){try{const x=await idbGetFrom(name);if(x&&Array.isArray(x.trades)&&Number.isFinite(Number(x.cash))&&Number.isFinite(Number(x.reservedMargin)))candidates.push(x)}catch(e){}}
 try{const x=await cacheGet();if(x&&Array.isArray(x.trades)&&Number.isFinite(Number(x.cash))&&Number.isFinite(Number(x.reservedMargin)))candidates.push(x)}catch(e){}
 if(candidates.length){candidates.sort((a,b)=>(Number(b.savedAt)||0)-(Number(a.savedAt)||0));applySnapshot(candidates[0]);save()}
 else {
   let legacy=null;
   try{if(localStorage.getItem(STORAGE.initialized)==="1") legacy={trades:JSON.parse(localStorage.getItem(STORAGE.trades)||"[]"),cash:Number(localStorage.getItem(STORAGE.cash)),reservedMargin:Number(localStorage.getItem(STORAGE.reserved)),pos:JSON.parse(localStorage.getItem(STORAGE.pos)||"null")}}catch(e){}
   if(!applySnapshot(legacy)){state.trades=[];state.cash=10000;state.reservedMargin=0;state.pos=null;state.pool=3000;save()}
 }
 // 安全设计：页面重载后自动交易始终默认关闭，避免断网/重连后未经确认自动恢复下单。
 state.auto=false;renderTrades();renderAuto();storageStatus();
}
setInterval(()=>{if(state.ready){save();storageStatus()}},5000);
function renderTrades(){const rows=state.trades.slice().reverse().map(x=>`<tr><td>${x.time}</td><td>${x.side}</td><td>${fmt(x.entry,1)}</td><td>${x.leverage}x</td><td>${x.mode}</td><td>$${fmt(x.margin,2)}</td><td>${fmt(x.contracts,0)}张</td><td>${x.exit?fmt(x.exit,1):"持仓中"}</td><td>${x.pnl==null?"--":"$"+fmt(x.pnl,2)}</td><td>${x.balanceAfter==null?"--":"$"+fmt(x.balanceAfter,2)}</td><td>${x.reason||""}</td></tr>`).join("");$("trades").innerHTML=rows}
function updateOpenTrade(reason=""){if(!state.pos)return;let t=state.trades.find(x=>x.id===state.pos.tradeId);if(!t)return;t.exit=null;t.pnl=null;t.fee=state.pos.entryFee;t.balanceAfter=equity();t.reason=reason||t.reason;renderTrades();save();storageStatus()}
function positionPlan(score){let a=Math.abs(score);if(a<2.8)return {margin:0,leverage:0,level:'不足以开仓'};if(a<3.2)return {margin:300,leverage:5,level:'确认'};if(a<3.8)return {margin:400,leverage:6,level:'较强'};if(a<4.4)return {margin:500,leverage:8,level:'强烈'};return {margin:600,leverage:10,level:'极强'};}
function floorLot(n){return Math.floor(n/state.lotSz)*state.lotSz}
function roundPx(n){return Math.round(n/state.tickSz)*state.tickSz}
function marketFill(side,contracts){
 let levels=side==='多'?state.book.asks:state.book.bids;if(!levels.length)return null;
 let need=contracts,filled=0,cost=0;
 for(const [px0,sz0] of levels){let px=+px0,sz=+sz0;if(!(px>0&&sz>0))continue;let take=Math.min(need,sz);cost+=take*px*state.ctVal*state.ctMult;filled+=take;need-=take;if(need<=1e-12)break;}
 if(filled+1e-12<contracts)return null;
 return {price:roundPx(cost/(filled*state.ctVal*state.ctMult)),contracts:filled,notional:cost};
}
function openPos(side){if(state.pos||!state.auto||!state.price)return;let plan=positionPlan(state.lastScore);if(!plan.margin)return;let margin=Math.min(plan.margin,state.cash*0.15,state.pool*0.2);if(margin<10)return;let leverage=plan.leverage,targetNotional=margin*leverage,ref=side==='多'?(state.askPx||state.price):(state.bidPx||state.price),contracts=floorLot(targetNotional/(ref*state.ctVal*state.ctMult));if(contracts<state.lotSz)return;let fill=marketFill(side,contracts);if(!fill)return;contracts=floorLot(fill.contracts);if(contracts<state.lotSz)return;let entry=fill.price,notional=fill.notional,fee=notional*state.takerFee;if(margin+fee>state.cash)return;state.cash-=margin+fee;state.reservedMargin+=margin;const id=Date.now()+'-'+Math.random().toString(36).slice(2,7);state.pos={tradeId:id,side,entry,margin,marginBalance:margin,leverage,mode:'逐仓',contracts,opened:Date.now(),openScore:state.lastScore,entryFee:fee,entryFunding:0,fundingPaid:0,peakMove:0};pushTrade({id,time:new Date().toLocaleString(),side,entry,leverage,mode:'逐仓',margin,contracts,exit:null,pnl:null,fee,openFee:fee,closeFee:0,fundingFee:0,balanceAfter:equity(),reason:`${state.lastReason}；信号强度 ${plan.level}（综合分 ${state.lastScore.toFixed(2)}）；保证金 $${fmt(margin,2)}；杠杆 ${leverage}x；OKX盘口吃单模拟成交；名义价值 $${fmt(notional,2)}；开仓手续费 $${fmt(fee,2)}`});renderTrades();save();storageStatus()}

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
async function closePos(reason){if(!state.pos)return;await applyFundingIfDue();let p=state.pos,dir=p.side==="多"?1:-1,fill=marketFill(p.side==="多"?"空":"多",p.contracts);if(!fill)return;let exit=fill.price,mark=state.markPx||state.price,gross=(exit-p.entry)*dir*p.contracts*state.ctVal*state.ctMult,exitNotional=fill.notional,exitFee=exitNotional*state.takerFee,totalFee=p.entryFee+exitFee,fundingFee=p.fundingPaid||0,pnl=gross-exitFee-fundingFee;state.reservedMargin=Math.max(0,state.reservedMargin-(p.marginBalance??p.margin));state.cash+=(p.marginBalance??p.margin)+gross-exitFee;let t=state.trades.find(x=>x.id===p.tradeId);if(t){t.exit=roundPx(exit);t.pnl=pnl;t.fee=totalFee;t.closeFee=exitFee;t.fundingFee=fundingFee;t.balanceAfter=state.cash;t.reason=`${reason}；持仓 ${Math.round((Date.now()-p.opened)/1000)}s；毛盈亏 $${fmt(gross,2)}；净盈亏 $${fmt(pnl,2)}`;}state.pos=null;state.lastTrade=Date.now();state.pool=Math.min(3000,Math.max(0,state.cash*0.3));renderTrades();save();storageStatus()}
async function managePosition(){if(!state.pos||!state.price)return;await applyFundingIfDue();let p=state.pos,mark=state.markPx||state.price,dir=p.side==="多"?1:-1,move=(mark-p.entry)/p.entry*dir,ag=aggregate(),z=indicators(state.candles["15m"]||[]);let adverse=(p.side==="多"&&ag.signal==="偏空")||(p.side==="空"&&ag.signal==="偏多");let momentumFade=(p.side==="多"&&z.dif<z.dea&&z.r<48)||(p.side==="空"&&z.dif>z.dea&&z.r>52);let atrStop=z.atr&&Math.abs(mark-p.entry)>z.atr*2.2&&move<0;let peak=p.peakMove??move;p.peakMove=Math.max(peak,move);let trail=p.peakMove>0.012&&move<=p.peakMove-0.003;let hardRisk=p.margin>0&&move<-(Math.max(0.008,(z.atr/(mark||1)||0)*2.0));updateOpenTrade(`持仓中；浮盈亏 $${fmt(unrealized(),2)}；峰值收益 ${(p.peakMove*100).toFixed(2)}%`);if(adverse&&Math.abs(ag.score)>3)closePos("综合方向反转");else if(momentumFade&&Math.abs(ag.score)>2)closePos("动能衰减");else if(atrStop||hardRisk)closePos("波动扩张且方向不利");else if(trail)closePos("盈利回撤保护")}
async function autoTrade(){if(!state.auto||!state.price||!state.ready)return;let ag=aggregate();state.lastSignal=ag.signal;if(!state.pos&&(ag.signal==="偏多"||ag.signal==="偏空")&&Math.abs(ag.score)>=2.8&&Date.now()-state.lastTrade>60000)openPos(ag.signal==="偏多"?"多":"空");await managePosition()}
async function getJSON(path){let r=await fetch(REST+path,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);let j=await r.json();if(j.code!=="0")throw new Error(j.msg||"OKX error");return j.data}
async function loadHistory(){for(const [k,bar] of Object.entries(TF)){try{let d=await getJSON(`/api/v5/market/candles?instId=${INST}&bar=${bar}&limit=300`);let rows=d.map(x=>[+x[0],+x[1],+x[2],+x[3],+x[4],+x[5]]).reverse();state.candles[k]=rows}catch(e){state.candles[k]=[]}}
 try{let d=await getJSON(`/api/v5/market/ticker?instId=${INST}`);if(d[0]){state.price=+d[0].last;state.bidPx=+d[0].bidPx||state.price;state.askPx=+d[0].askPx||state.price;state.open24h=+d[0].open24h||state.price;state.vol=+d[0].volCcy24h||0}}catch(e){}
 try{let d=await getJSON(`/api/v5/public/mark-price?instType=SWAP&instId=${INST}`);if(d[0])state.markPx=+d[0].markPx||state.price}catch(e){}
 try{let d=await getJSON(`/api/v5/public/open-interest?instType=SWAP&instId=${INST}`);if(d[0]){state.oi=+d[0].oiCcy||0;state.oiHistory.push({t:Date.now(),v:state.oi})}}catch(e){}
 try{let d=await getJSON(`/api/v5/public/funding-rate?instId=${INST}`);if(d[0]){state.funding=+d[0].fundingRate||0;state.nextFundingTime=+d[0].nextFundingTime||0}}catch(e){}
 try{let d=await getJSON(`/api/v5/public/instruments?instType=SWAP&instId=${INST}`);if(d[0]){if(+d[0].ctVal>0)state.ctVal=+d[0].ctVal;if(+d[0].ctMult>0)state.ctMult=+d[0].ctMult;if(+d[0].lotSz>0)state.lotSz=+d[0].lotSz;if(+d[0].tickSz>0)state.tickSz=+d[0].tickSz}}catch(e){}
 state.ready=true;updateUI()}
function sub(ws,args){ws.send(JSON.stringify({op:"subscribe",args}))}
function applyBookUpdate(d){
 const side=(arr,key)=>{const m=new Map(state.book[key].map(x=>[x[0],x[1]]));for(const row of (arr||[])){const px=row[0],sz=row[1];if(+sz===0)m.delete(px);else m.set(px,sz)}state.book[key]=Array.from(m.entries()).sort((a,b)=>key==="bids"?(+b[0]-+a[0]):(+a[0]-+b[0]));};
 if(d.action==="snapshot"||!state.book.bids.length&&!state.book.asks.length){state.book={bids:d.bids||[],asks:d.asks||[]};return}
 side(d.bids,"bids");side(d.asks,"asks");
}
function connect(){const ws=new WebSocket(WS);state.ws=ws;ws.onopen=()=>{$("status").textContent="OKX 实时数据";sub(ws,[{channel:"tickers",instId:INST},{channel:"mark-price",instType:"SWAP",instId:INST},{channel:"open-interest",instType:"SWAP",instId:INST},{channel:"funding-rate",instId:INST},{channel:"trades",instId:INST},{channel:"books",instId:INST},...Object.values(TF).map(bar=>({channel:`candle${bar}`,instId:INST}))])};ws.onmessage=e=>{let m=JSON.parse(e.data);if(!m.data)return;let d=m.data[0],ch=m.arg?.channel;
 if(ch==="tickers"){state.price=+d.last;state.bidPx=+d.bidPx||state.price;state.askPx=+d.askPx||state.price;state.open24h=+d.open24h||state.open24h;state.vol=+d.volCcy24h||state.vol;state.priceHistory.push({t:Date.now(),v:state.price});state.priceHistory=state.priceHistory.filter(x=>Date.now()-x.t<360000)}
 if(ch==="mark-price")state.markPx=+d.markPx||state.price;
 if(ch==="open-interest"){state.oi=+d.oiCcy||0;state.oiHistory.push({t:Date.now(),v:state.oi});state.oiHistory=state.oiHistory.filter(x=>Date.now()-x.t<360000)}
 if(ch==="funding-rate"){state.funding=+d.fundingRate||0;state.nextFundingTime=+d.nextFundingTime||state.nextFundingTime}
 if(ch==="books"){applyBookUpdate(d);}
 if(ch==="trades"){let px=+d.px,sz=+d.sz,side=d.side;state.flowHistory.push({t:Date.now(),b:side==="buy"?sz:0,s:side==="sell"?sz:0,px});state.flowHistory=state.flowHistory.filter(x=>Date.now()-x.t<300000)}
 if(ch?.startsWith("candle")){let key=ch.replace("candle","");state.candles[key]??=[];let x=d,xr=[+x[0],+x[1],+x[2],+x[3],+x[4],+x[5]];let a=state.candles[key];if(a.length&&a.at(-1)[0]===xr[0])a[a.length-1]=xr;else a.push(xr);if(a.length>300)a.shift()}
 updateUI();autoTrade()};ws.onclose=()=>{$("status").textContent="断线，重连中…";setTimeout(connect,2000)};ws.onerror=()=>ws.close()}
window.addEventListener("pagehide",()=>save());window.addEventListener("beforeunload",()=>save());document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")save()});
$("auto").onclick=()=>{state.auto=!state.auto;renderAuto();if(!state.auto&&state.pos)closePos("手动关闭自动交易")};
load().then(()=>loadHistory()).then(connect).catch(()=>{state.ready=true;connect()});setInterval(()=>{updateUI();autoTrade()},1000);
