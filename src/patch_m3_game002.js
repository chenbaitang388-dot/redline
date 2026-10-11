'use strict';
/* GAME-002 M3 补丁（整体重写版）：MAX_LEVELS24 + LEVELS 首帧 24 行 + 真实 startWave wire + 三类真实目标
   仅 3 条编辑：① MAX_LEVELS 12->24 ② startWave 真实 hook ③ 顶层单块注入（全部 M3 代码）
   要求：不吞 wire 错误（记录到 window.__M3WIRE.err）；LEVELS 在首次开局前补齐 24 行。 */
const M3CODE = `
/* ===== GAME-002 M3：24 关 / 10 档 / 三类真实目标 ===== */
window.__M3WIRE = { calls: 0, last: null, err: null };
var M3_BOSS_LEVELS = [4,8,12,16,20,24];
var M3_BASE_STAGES = (function(){
  var names=['断街突围','废厂回廊','旧港封锁','荒轨岔口','熔渣通道','裂谷哨站','灰烬广场','断层回廊','深井升降','暗涌水道','祭坛前庭','火痕长廊','冷焰回环','陷落阶梯','核心外环','残响中枢','镜面回廊','沉钟平台','铁雨走廊','断层深渊','深渊门廊','回响之井','终末祭坛','核心之心'];
  var types=[['chaser'],['chaser','shooter'],['chaser','shooter','chaser'],['chaser','shooter','charger']];
  var rows=[];
  for(var i=0;i<24;i++){ var lv=i+1; var bt=(lv%4===0)?Math.min(3,Math.ceil(lv/4)):0;
    rows.push([names[i], (i%4), 9+Math.floor(i/2)*2, types[Math.min(3,Math.floor(i/3))].slice(), bt]); }
  return rows; })();
/* 首帧前补齐真实 LEVELS 到 24 行（不依赖 hook 才发生） */
try{ while(LEVELS.length < 24){ LEVELS.push(M3_BASE_STAGES[LEVELS.length].slice()); } }catch(e){ window.__M3WIRE.err = 'levels-topup:'+e.message; }
var M3_STAGES = [];
(function(){
  var chapters=['第一章 边境','第二章 废墟','第三章 熔炉','第四章 深井','第五章 祭坛','第六章 核心'];
  var rot=[['outpost','clear','ritual'],['danger','outpost','clear'],['ritual','danger','outpost'],
           ['clear','ritual','danger'],['outpost','danger','ritual'],['danger','clear','outpost']];
  for(var c=0;c<6;c++){ for(var k=0;k<4;k++){ var lv=c*4+k+1; var isBoss=M3_BOSS_LEVELS.indexOf(lv)>=0;
    M3_STAGES.push({ level:lv, chapter:c+1, chapterName:chapters[c], indexInChapter:k+1, boss:isBoss,
      goal:isBoss?'boss':rot[c][k], elite:(k>=2), arena:(c+1), name:chapters[c]+' · 第'+(k+1)+'节' }); } }
})();
function m3StageOf(lv){ for(var i=0;i<M3_STAGES.length;i++){ if(M3_STAGES[i].level===lv) return M3_STAGES[i]; } return null; }
function m3GoalOf(lv){ var s=m3StageOf(lv); return s? s.goal : 'clear'; }
var M3  = { on:true, r:90, hp:100, maxHp:100, deadlineSec:45, t0:null, cleared:false, failed:false, inited:false, hitRatePerSec:9, cx:800, cy:560, level:1 };
var M3R = { on:true, deadlineSec:30, target:null, t0:null, inited:false, interrupted:false, failed:false, ritualHp0:null, level:1 };
var M3D = { on:true, durationSec:35, r:120, warnR:170, dps:14, tickAcc:0, t0:null, inited:false, done:false, zt:0, cx:800, cy:560, level:1 };
window.__M3OUTPOST = M3; window.__M3RITUAL = M3R; window.__M3DANGER = M3D;
function m3WireStage(w){
  try{
    window.__M3WIRE.calls++; window.__M3WIRE.last = w;
    var st = m3StageOf(w); if(!st) return;
    G.m3Stage = st;
    if(typeof m3Reset==='function') m3Reset();
    if(typeof m3rReset==='function') m3rReset();
    if(typeof m3dReset==='function') m3dReset();
    /* 从不可变基准覆盖本关（不累加 → 重开不无限增怪） */
    while(LEVELS.length < 24){ LEVELS.push(M3_BASE_STAGES[LEVELS.length].slice()); }
    var base = M3_BASE_STAGES[w-1];
    LEVELS[w-1] = [ base[0], base[1], base[2], base[3].slice(), base[4] ];
    var dif = (typeof getDifficulty==='function')? getDifficulty() : null;
    var extra = (dif && dif.maxEn) ? Math.max(0, dif.maxEn-2) : 0;
    var t = LEVELS[w-1][3].slice();
    for(var i=0;i<extra;i++){ t.push(t[i%Math.max(1,t.length)]); }
    LEVELS[w-1][3] = t;
    LEVELS[w-1][4] = st.boss ? Math.max(1, base[4]||1) : 0;
    var gt = (dif && dif.goalTime) ? dif.goalTime : 1.0;
    M3.deadlineSec = Math.round(45*gt); M3R.deadlineSec = Math.round(30*gt); M3D.durationSec = Math.round(35*gt);
    if(typeof toast==='function') toast('第 '+w+' 关：'+st.name+(st.boss?'（Boss）':'（目标：'+st.goal+'）'),'good');
  }catch(e){ window.__M3WIRE.err = String(e && e.message || e); }
}
function m3SyncGoalLevels(){ var o=null,r=null,d=null;
  for(var i=0;i<M3_STAGES.length;i++){ var s=M3_STAGES[i]; if(s.boss) continue;
    if(!o&&s.goal==='outpost')o=s.level; if(!r&&s.goal==='ritual')r=s.level; if(!d&&s.goal==='danger')d=s.level; }
  if(o)M3.level=o; if(r)M3R.level=r; if(d)M3D.level=d; }
m3SyncGoalLevels();
/* ---- 据点守卫 ---- */
function m3Reset(){ M3.inited=false; M3.cleared=false; M3.failed=false; M3.t0=null; M3.hp=M3.maxHp; }
function m3Hide(){ ['m3fx','m3bar','m3hud'].forEach(function(id){ var d=document.getElementById(id); if(d)d.style.display='none'; }); }
function m3Active(){ try{ return M3.on && G.state==='play' && m3GoalOf(G.wave)==='outpost'; }catch(e){ return false; } }
function m3Init(){ M3.inited=true; M3.hp=M3.maxHp; M3.t0=(G.time===undefined?0:G.time); M3.cleared=false; M3.failed=false; }
function m3OutpostTick(dt){
  if(!M3.on) return;
  if(m3GoalOf(G.wave)!=='outpost'){ if(M3.inited)m3Reset(); m3Hide(); return; }
  if(G.state!=='play'){ m3Hide(); return; }
  if(!M3.inited) m3Init();
  var n=0; for(var i=0;i<en.length;i++){ var e=en[i]; if(!e||e.dead) continue; if(Math.hypot(e.x-M3.cx,e.y-M3.cy)<=M3.r+(e.r||14)) n++; }
  var eff=Math.min(4,n); if(eff>0) M3.hp=Math.max(0,M3.hp-M3.hitRatePerSec*eff*dt);
  if(M3.hp<=0 && !M3.failed){ M3.failed=true; if(typeof gameOver==='function') gameOver(false,'据点失守'); else { G.state='over'; G.win=false; G.reason='据点失守'; } }
  var t0ok=(M3.t0===null||M3.t0===undefined)?G.time:M3.t0;
  if(!M3.failed && G.time-t0ok>=M3.deadlineSec && !M3.cleared){ M3.cleared=true; try{ toast('据点守卫成功','good'); }catch(e){} }
  if(!m3CanAdvance() && G.clearT>0.4) G.clearT=0;
  m3Draw(t0ok);
}
function m3Draw(t0ok){
  var c=document.querySelector('canvas'); if(!c) return;
  var d=document.getElementById('m3hud'); if(!d){ d=document.createElement('div'); d.id='m3hud';
    d.style.cssText='position:fixed;right:10px;top:10px;z-index:9998;font:12px monospace;color:#ffd7a0;background:rgba(0,0,0,.5);padding:4px 8px;border-radius:5px;white-space:pre'; document.body.appendChild(d); }
  d.style.display='block';
  var left=Math.max(0,M3.deadlineSec-(G.time-t0ok));
  d.textContent='当前目标：据点守卫\\n倒计时 '+left.toFixed(1)+' 秒\\n据点耐久 '+Math.max(0,M3.hp).toFixed(1)+'/'+M3.maxHp+'\\n失败条件：耐久归零\\n'+(M3.cleared?'已达成（可清场升关）':(M3.failed?'已失败':'守卫中…'));
  var r=c.getBoundingClientRect(); var sx=r.left+r.width*(M3.cx/1600), sy=r.top+r.height*(M3.cy/1000), rr=r.width*(M3.r/1600);
  var cv=document.getElementById('m3fx'); if(!cv){ cv=document.createElement('div'); cv.id='m3fx';
    cv.style.cssText='position:fixed;pointer-events:none;z-index:9997;border:2px solid rgba(255,140,60,.75);border-radius:50%;background:rgba(255,140,60,.10)'; document.body.appendChild(cv); }
  cv.style.display='block'; cv.style.left=(sx-rr)+'px'; cv.style.top=(sy-rr)+'px'; cv.style.width=(rr*2)+'px'; cv.style.height=(rr*2)+'px';
}
/* ---- 打断仪式 ---- */
function m3rHide(){ ['m3rhud','m3rring','m3rbar'].forEach(function(id){ var d=document.getElementById(id); if(d)d.style.display='none'; }); }
function m3rReset(){ M3R.inited=false; M3R.interrupted=false; M3R.failed=false; M3R.t0=null; M3R.target=null; M3R.ritualHp0=null; }
function m3rActive(){ try{ return M3R.on && G.state==='play' && m3GoalOf(G.wave)==='ritual'; }catch(e){ return false; } }
function m3rInit(){ var best=null;
  for(var i=0;i<en.length;i++){ var e=en[i]; if(!e||e.dead) continue; if(!best||(e.rank||1)>(best.rank||1)) best=e; }
  if(!best) return false;
  M3R.inited=true; M3R.t0=(G.time===undefined?0:G.time); M3R.interrupted=false; M3R.failed=false;
  M3R.target=best; best.ritual=true; M3R.ritualHp0=best.hp; return true; }
function m3RitualTick(dt){
  if(!M3R.on) return;
  if(m3GoalOf(G.wave)!=='ritual'){ if(M3R.inited)m3rReset(); m3rHide(); return; }
  if(G.state!=='play'){ m3rHide(); return; }
  if(!M3R.inited){ if(!m3rInit()){ m3rHide(); return; } }
  if(!M3R.target){ m3rHide(); return; }
  if(M3R.target.dead||M3R.target.hp<=0){ if(!M3R.interrupted){ M3R.interrupted=true; try{ toast('仪式被打断','good'); }catch(e){} } }
  else { var t0ok=(M3R.t0===null||M3R.t0===undefined)?G.time:M3R.t0;
    if(G.time-t0ok>=M3R.deadlineSec && !M3R.failed){ M3R.failed=true; if(typeof gameOver==='function') gameOver(false,'仪式完成'); else { G.state='over'; G.win=false; G.reason='仪式完成'; } } }
  if(!m3CanAdvance() && G.clearT>0.4) G.clearT=0;
  m3rDraw();
}
function m3rDraw(){
  var d=document.getElementById('m3rhud'); if(!d){ d=document.createElement('div'); d.id='m3rhud';
    d.style.cssText='position:fixed;left:10px;top:10px;z-index:9998;font:12px monospace;color:#ffb0d0;background:rgba(0,0,0,.5);padding:4px 8px;border-radius:5px;white-space:pre'; document.body.appendChild(d); }
  d.style.display='block';
  var t0ok=(M3R.t0===null||M3R.t0===undefined)?G.time:M3R.t0; var left=Math.max(0,M3R.deadlineSec-(G.time-t0ok));
  var t=M3R.target; var pct=(t&&M3R.ritualHp0)?Math.max(0,Math.min(1,t.hp/M3R.ritualHp0)):0;
  d.textContent='当前目标：打断仪式\\n仪式倒计时 '+left.toFixed(1)+' 秒\\n仪式目标生命 '+Math.round(pct*100)+'%\\n失败条件：倒计时结束且目标存活\\n'+(M3R.interrupted?'已打断（仍需清场）':(M3R.failed?'已失败':'进行中…'));
  var c=document.querySelector('canvas'); if(!c||!t) return;
  var r=c.getBoundingClientRect(); var sx=r.left+r.width*(t.x/1600), sy=r.top+r.height*(t.y/1000), rr=r.width*(46/1600);
  var ring=document.getElementById('m3rring'); if(!ring){ ring=document.createElement('div'); ring.id='m3rring';
    ring.style.cssText='position:fixed;pointer-events:none;z-index:9997;border:2px dashed rgba(255,90,160,.9);border-radius:50%;background:rgba(255,90,160,.10)'; document.body.appendChild(ring); }
  ring.style.display='block'; ring.style.left=(sx-rr)+'px'; ring.style.top=(sy-rr)+'px'; ring.style.width=(rr*2)+'px'; ring.style.height=(rr*2)+'px';
}
/* ---- 移动危险区 ---- */
function m3dHide(){ ['m3dhud','m3dzone','m3dwarn'].forEach(function(id){ var d=document.getElementById(id); if(d)d.style.display='none'; }); }
function m3dReset(){ M3D.inited=false; M3D.done=false; M3D.t0=null; M3D.zt=0; M3D.tickAcc=0; }
function m3dActive(){ try{ return M3D.on && G.state==='play' && m3GoalOf(G.wave)==='danger'; }catch(e){ return false; } }
function m3dZonePos(){ var a=M3D.zt*0.55; return { x:M3D.cx+Math.cos(a)*430, y:M3D.cy+Math.sin(a*0.8)*230 }; }
function m3dInit(){ M3D.inited=true; M3D.t0=(G.time===undefined?0:G.time); M3D.done=false; M3D.zt=0; M3D.tickAcc=0; }
function m3DangerTick(dt){
  if(!M3D.on) return;
  if(m3GoalOf(G.wave)!=='danger'){ if(M3D.inited)m3dReset(); m3dHide(); return; }
  if(G.state!=='play'){ m3dHide(); return; }
  if(!M3D.inited) m3dInit();
  M3D.zt+=dt; var z=m3dZonePos(); var d=Math.hypot(P.x-z.x,P.y-z.y);
  if(d<=M3D.r+P.r){ M3D.tickAcc+=dt; if(M3D.tickAcc>=0.5){ M3D.tickAcc=0; if(typeof hurtPlayer==='function') hurtPlayer(M3D.dps,z.x,z.y,{src:'hazard-zone'}); } } else M3D.tickAcc=0;
  var t0ok=(M3D.t0===null||M3D.t0===undefined)?G.time:M3D.t0;
  if(!M3D.done && (G.time-t0ok)>=M3D.durationSec){ M3D.done=true; try{ toast('生存达成','good'); }catch(e){} }
  if(!m3CanAdvance() && G.clearT>0.4) G.clearT=0;
  m3dDraw(t0ok,z,d);
}
function m3dDraw(t0ok,z,d){
  var hud=document.getElementById('m3dhud'); if(!hud){ hud=document.createElement('div'); hud.id='m3dhud';
    hud.style.cssText='position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9998;font:12px monospace;color:#bfe3ff;background:rgba(0,0,0,.5);padding:4px 8px;border-radius:5px;white-space:pre'; document.body.appendChild(hud); }
  hud.style.display='block'; var left=Math.max(0,M3D.durationSec-(G.time-t0ok));
  hud.textContent='当前目标：危险区生存\\n剩余 '+left.toFixed(1)+' 秒\\n'+(d<=M3D.r+P.r?'⚠ 你在危险区内（持续受伤）':'安全')+'\\n失败条件：生命归零\\n'+(M3D.done?'已达成（可进入升级）':'躲避红色区域');
  var c=document.querySelector('canvas'); if(!c) return;
  var r=c.getBoundingClientRect(); var sx=r.left+r.width*(z.x/1600), sy=r.top+r.height*(z.y/1000), rr=r.width*(M3D.r/1600), wr=r.width*(M3D.warnR/1600);
  var w=document.getElementById('m3dwarn'); if(!w){ w=document.createElement('div'); w.id='m3dwarn';
    w.style.cssText='position:fixed;pointer-events:none;z-index:9996;border:1px dashed rgba(255,80,80,.55);border-radius:50%;background:rgba(255,80,80,.06)'; document.body.appendChild(w); }
  w.style.display='block'; w.style.left=(sx-wr)+'px'; w.style.top=(sy-wr)+'px'; w.style.width=(wr*2)+'px'; w.style.height=(wr*2)+'px';
  var zone=document.getElementById('m3dzone'); if(!zone){ zone=document.createElement('div'); zone.id='m3dzone';
    zone.style.cssText='position:fixed;pointer-events:none;z-index:9997;border:2px solid rgba(255,40,40,.9);border-radius:50%;background:rgba(255,40,40,.18)'; document.body.appendChild(zone); }
  zone.style.display='block'; zone.style.left=(sx-rr)+'px'; zone.style.top=(sy-rr)+'px'; zone.style.width=(rr*2)+'px'; zone.style.height=(rr*2)+'px';
}
/* ---- 统一升关门禁 ---- */
function m3CanAdvance(){
  var needO=(typeof m3Active==='function')&&m3Active();
  var needR=(typeof m3rActive==='function')&&m3rActive();
  var needD=(typeof m3dActive==='function')&&m3dActive();
  if(!needO&&!needR&&!needD) return true;
  if(needO&&!M3.cleared) return false;
  if(needR&&!(M3R.inited&&M3R.interrupted)) return false;
  if(needD&&!M3D.done) return false;
  return true;
}
window.__M3MANIFEST = { edition:'redline-v2-m3', maxLevels:MAX_LEVELS, difficulties:DIFFICULTIES.length,
  stages:M3_STAGES.length, goalTypes:['outpost','ritual','danger'], bossLevels:M3_BOSS_LEVELS.slice(),
  goalDistribution:(function(){ var m={}; for(var i=0;i<M3_STAGES.length;i++){ var g=M3_STAGES[i].goal; m[g]=(m[g]||0)+1; } return m; })(),
  levelsLen:(typeof LEVELS!=='undefined'?LEVELS.length:null), stagesTable:M3_STAGES };
`;
const EDITS = [
  { id: 'm3-goal-tick-hook', desc: '在真实 G.time+=dt; G.waveT+=dt; 之后同步调用三个 goal tick；goal 结束立即 return（不继续敌伤/普通胜负）',
    re: /G\.time\+=dt;\s*G\.waveT\+=dt;/,
    to: 'G.time+=dt; G.waveT+=dt;\n  m3OutpostTick(dt); m3RitualTick(dt); m3DangerTick(dt); if(G.state!==\'play\') return;' },
  { id: 'm3-real-gate', desc: '真实升关条件门禁：if(G.clearT>.4 && m3CanAdvance())',
    re: /if\(G\.clearT>\.4\)\{ G\.clearT=0; openUpgrade\(\); \}/,
    to: 'if(G.clearT>.4){ if(typeof m3CanAdvance===\'function\' ? m3CanAdvance() : true){ G.clearT=0; openUpgrade(); } }' },
  { id: 'm3-unlock-check-page', desc: '页面 infernoUnlocked 改查 campaign24Cleared + edition（防旧 M2 记录误解锁）',
    re: /return !!\(pr&&pr\.infernoUnlocked===true\);/,
    to: "return !!(pr&&pr.campaign24Cleared===true&&pr.edition==='redline-v2-m3');" },
  { id: 'm3-send-campaign24', desc: '页面全程 hell 胜利时同时发送 campaign24-cleared（带 wave/runStart/trialBoss/dkey，由宿主校验）',
    re: /window\.chrome\.webview\.postMessage\(\{type:'hell-campaign-cleared'\}\);/,
    to: "window.chrome.webview.postMessage({type:'hell-campaign-cleared'});window.chrome.webview.postMessage({type:'campaign24-cleared',wave:(typeof G!=='undefined'?G.wave:null),runStart:(typeof G!=='undefined'?G.runStart:null),trialBoss:(typeof G!=='undefined'?!!G.trialBoss:null),dkey:(typeof getDifficulty==='function'?getDifficulty().key:null)});" },
  { id: 'm3-text-24a', desc: '锁定文案 12 -> 24 关',
    re: /地狱完整12关通关解锁/,
    to: '地狱完整24关通关解锁' },
  { id: 'm3-text-24b', desc: 'Boss 关说明 4/8/12 -> 4/8/12/16/20/24',
    re: /第 4 \/ 8 \/ 12 关为守关 Boss/,
    to: '第 4 / 8 / 12 / 16 / 20 / 24 关为守关 Boss' },
  { id: 'm3-timer-main-single', desc: '删除主 update 的 e.timer-=dt（保留 enemyAI 各 mode 分支原有递减；不改数值）',
    re: /e\.t\+=dt; e\.cd-=dt; e\.decide-=dt; e\.timer-=dt;/,
    to: 'e.t+=dt; e.cd-=dt; e.decide-=dt;' },
  { id: 'm3-diffs-10', desc: '在真实 DIFFICULTIES 补 4 档更高难度（沿用原字段 schema；保持 EDITS 顺序）',
    re: /DIFFICULTIES=\[/,
    to: `DIFFICULTIES=[
 {key:'expert', name:'专家', tag:'精英混编 · 预警收紧', hp:1.10, damage:1.00, speed:1.06, warn:0.32, cooldown:1.02, bossWarn:0.46, bossRecovery:0.50, iframe:0.50, slotScale:0.90, lead:0.62, inferno:false, maxEn:4},
 {key:'master', name:'大师', tag:'场地机制叠加', hp:1.20, damage:1.12, speed:1.10, warn:0.28, cooldown:0.94, bossWarn:0.40, bossRecovery:0.46, iframe:0.46, slotScale:0.85, lead:0.68, inferno:false, maxEn:5},
 {key:'nightmare', name:'噩梦', tag:'持续压力', hp:1.32, damage:1.24, speed:1.14, warn:0.24, cooldown:0.86, bossWarn:0.34, bossRecovery:0.42, iframe:0.42, slotScale:0.80, lead:0.74, inferno:true, maxEn:6},
 {key:'abyss', name:'深渊', tag:'最高压；保留预警与反应窗', hp:1.45, damage:1.38, speed:1.18, warn:0.20, cooldown:0.78, bossWarn:0.30, bossRecovery:0.38, iframe:0.38, slotScale:0.76, lead:0.80, inferno:true, maxEn:7},` },
  { id: 'm3-maxlevels-24', desc: 'const MAX_LEVELS=12 -> 24', re: /const MAX_LEVELS=12;/, to: 'const MAX_LEVELS=24;' },
  { id: 'm3-startwave-hook', desc: '真实 startWave hook（G.wave=w;G.state=play; 之后、Boss tier/障碍生成之前）',
    re: /G\.wave=w;G\.state='play';G\.bossCleared=false;G\.victoryT=0;/,
    to: "G.wave=w;G.state='play';G.bossCleared=false;G.victoryT=0; if(typeof m3WireStage==='function') m3WireStage(w);" },
  { id: 'm3-all-layers', desc: '顶层单块注入：LEVELS 首帧 24 + wire + 三目标层 + 统一门禁 + manifest',
    re: /<\/script>(?![\s\S]*<\/script>)/,
    to: M3CODE + '</script>' }
];
function apply(html) {
  let out = html; const edits = [], missed = [];
  for (const e of EDITS) {
    let n = 0;
    out = out.replace(e.re, function () { n++; const a = arguments; return e.to.replace(/\$(\d)/g, (m, i) => a[+i] === undefined ? '' : a[+i]); });
    if (n > 0) edits.push({ id: e.id, desc: e.desc, count: n });
    else missed.push({ id: e.id, desc: e.desc });
  }
  return { html: out, edits, missed, ok: missed.length === 0 };
}
module.exports = { name: 'patch_m3_game002', apply, EDITS };
