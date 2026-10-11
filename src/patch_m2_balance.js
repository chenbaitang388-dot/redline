'use strict';
/* GAME-002 M2 平衡补丁 v2（redline-v2；不改冻结评估页）
   锚点全部来自实读 game-v2.html；任一 EDIT 未命中 → ok=false，build_v2 必须 throw 且不写产物。
   M2 初值（作者选择，非最优）：
     rate：递减（≥1.6 增量减半、≥2.0 再减半）+ 硬上限 2.20；卡描述显示**当前实际增幅**
     range：上限 180；接近上限时增益递减（按剩余空间比例）
     life：上限 0.15；**旧吸血行已移除**，仅保留本补丁的令牌桶回血
     令牌桶：容量 6% maxHp（半秒量），按游戏 time 以 **12% maxHp/秒**恢复，全部目标/同帧共享；每 run 重置
     白名单：仅**直接斩击**（轻/重）可吸；带 src 标签的爆炸/持续/反伤/反射显式排除；未标注的非常规路径列为已知限制
   eff 独立于 G.dmgLedger；死目标/无伤/过杀不回血；shield/无敌分支在 hurtEnemy 前已 return 的调用不受影响。 */
const EDITS = [
  { id: 'eff-independent', desc: '在 hurtEnemy 入口独立计算有效伤害 __eff（不依赖 G.dmgLedger）',
    re: /if\(e\.dead\)return;\r?\n/, to: 'if(e.dead)return;\n  var __eff=Math.min(Math.max(0,dmg),Math.max(0,e.hp));\n' },
  { id: 'ledger-reuse-eff', desc: 'ledger 分支复用同一 eff',
    re: /if\(G\.dmgLedger\)\{ var eff=Math\.min\(Math\.max\(0,dmg\),Math\.max\(0,e\.hp\)\);/,
    to: 'if(G.dmgLedger){ var eff=__eff;' },
  { id: 'remove-old-lifesteal', desc: '**移除旧吸血行**（P.hp+=dmg*P.life，用 raw dmg 且绕过预算）',
    re: /if\(P\.life>0\)\{ P\.hp=Math\.min\(P\.maxHp,P\.hp\+dmg\*P\.life\); \}\r?\n?/,
    to: '/* [M2] 旧吸血已移除：吸血改由 hurtEnemy 内令牌桶按 __eff 统一结算 */\n' },
  { id: 'hp-clamp-and-heal-bucket', desc: 'HP 下限 0 + 令牌桶回血（有效扣血 / 共享容量 / 12%maxHp/s / 白名单）',
    re: /e\.hp-=dmg; e\.flash=1;/,
    to: 'e.hp=Math.max(0,e.hp-dmg); e.flash=1;\n' +
        '  if(__eff>0&&P.life>0&&typeof G!==\'undefined\'){\n' +
        '    var __melee=!!(opts&&opts.src==="melee");   /* 仅显式标注 melee 才吸；未标注一律不吸 */\n' +
        '    if(__melee&&P.hp<P.maxHp){\n' +
        '      var __t=G.time||0, __cap=0.06*P.maxHp, __refill=0.12*P.maxHp;\n' +
        '      if(G.hbTok===undefined){G.hbTok=__cap;G.hbT=__t;}\n' +
        '      var __prevT=(G.hbT===undefined||G.hbT===null)?__t:G.hbT;   /* null/undefined 判断，不用 || 吞合法 0 */\n' +
        '      var __dt=Math.max(0,__t-__prevT); G.hbT=__t; G.hbTok=Math.min(__cap,(G.hbTok||0)+__refill*__dt);\n' +
        '      var __want=__eff*P.life, __heal=Math.min(__want,G.hbTok,Math.max(0,P.maxHp-P.hp));\n' +
        '      if(__heal>0){ P.hp+=__heal; G.hbTok-=__heal; G.healGross=(G.healGross||0)+__heal; G.healSpent=(G.healSpent||0)+__heal; }\n' +
        '    } }' },
  { id: 'ups-rate', desc: '疾风：递减 + 上限 2.20，描述显示当前实际增幅',
    re: /\{n:'疾风',d:'攻速 \+22%',a:function\(p\)\{p\.rate\*=1\.22;\}\}/,
    to: "{n:'疾风',d:'攻速提升（递减，上限 +120%）',a:function(p){var inc=p.rate>=2.0?0.055:(p.rate>=1.6?0.11:0.22);var nv=Math.min(2.2,p.rate+inc);p.rate=nv;},dyn:function(p){var inc=p.rate>=2.0?0.055:(p.rate>=1.6?0.11:0.22);return '实际 +'+Math.round(Math.min(2.2,p.rate+inc)/p.rate*100-100)+'%（当前 x'+p.rate.toFixed(2)+'）';}}" },
  { id: 'ups-range', desc: '长臂：接近上限时递减 + 上限 180，描述显示实际增幅',
    re: /\{n:'长臂',d:'斩击范围 \+22%',a:function\(p\)\{p\.range\*=1\.22;\}\}/,
    to: "{n:'长臂',d:'斩击范围提升（近上限递减，上限 180）',a:function(p){var room=Math.max(0,180-p.range);var add=Math.min(room,p.range*0.22,(room/180)*p.range*0.44+ (room>0?p.range*0.05:0));p.range=Math.min(180,p.range+add);},dyn:function(p){var room=Math.max(0,180-p.range);if(room<=0)return '已达上限 180';var next=Math.min(room,p.range*0.22,(room/180)*p.range*0.44+(room>0?p.range*0.05:0));return '下一张 +'+Math.round(next)+' 范围（现 '+Math.round(p.range)+'）';}}" },
  { id: 'ups-life', desc: '吸血鬼：+5%，上限 15%，描述显示当前值',
    re: /\{n:'吸血鬼',d:'命中回复生命（伤害的 5%）',a:function\(p\)\{p\.life\+=\.05;\}\}/,
    to: "{n:'吸血鬼',d:'命中回复生命（上限 15%，受共享恢复额度约束）',a:function(p){p.life=Math.min(0.15,p.life+0.05);},dyn:function(p){var y=Math.min(0.05,0.15-p.life)*100;return '当前 '+(p.life*100).toFixed(0)+'%，下一张 +'+y.toFixed(0)+' 百分点（上限 15%）；按有效伤害·直接轻重·Boss 不吸·共享恢复额度';}}" },
  { id: 'panel-actual', desc: '面板展示 rate/range/life 实际值与上限',
    re: /heavyMul:P\.heavyMul, burstDmg:P\.burstDmg, life:P\.life,/,
    to: "heavyMul:P.heavyMul, burstDmg:P.burstDmg, life:P.life, rateCap:2.2, rangeCap:180, lifeCap:0.15, healTok:(typeof G!=='undefined'?G.hbTok:undefined), healGross:(typeof G!=='undefined'?G.healGross:0)," },
  { id: 'balance-mark', desc: 'M2 版本标记（含实际配置值；不改 AI 开关）',
    re: /$/,
    to: '\n<script>window.__REDLINE_BALANCE__={patch:"m2",edition:"redline-v2-m2",rateCap:2.2,rangeCap:180,lifeCap:0.15,healBucketCapPctMaxHp:0.06,healRefillPctMaxHpPerSec:0.12,healSourceWhitelist:"direct-melee-only",oldLifestealRemoved:true,effIndependentOfLedger:true};</script>\n' },
  { id: 'src-melee', desc: '近战命中点标注 src=melee（原无 opts，保留语义）',
    re: /hurtEnemy\(e,dmg,P\.aim,knock,impact\);hits\+\+;/,
    to: 'hurtEnemy(e,dmg,P.aim,knock,impact,{src:"melee"});hits++;' },
  { id: 'src-explosion', desc: '爆炸/范围伤害标注 src=explosion（不吸血）',
    re: /if\(Math\.hypot\(e\.x-x,e\.y-y\)<rad\) hurtEnemy\(e,dmg,Math\.atan2\(e\.y-y,e\.x-x\),120,false\); \}/,
    to: 'if(Math.hypot(e.x-x,e.y-y)<rad) hurtEnemy(e,dmg,Math.atan2(e.y-y,e.x-x),120,false,{src:"explosion"}); }' },
  { id: 'src-dash', desc: '冲刺伤害标注 src=dash（不吸血）',
    re: /e\.hitCd=\.4; hurtEnemy\(e,22\*P\.dashDmg,P\.dashA,240,false\); \}/,
    to: 'e.hitCd=.4; hurtEnemy(e,22*P.dashDmg,P.dashA,240,false,{src:"dash"}); }' },
  { id: 'src-burst', desc: '爆发伤害标注 src=burst（不吸血）',
    re: /if\(Math\.hypot\(e\.x-P\.x,e\.y-P\.y\)<rad\)\{ hurtEnemy\(e,70\*P\.burstDmg,P\.aim,420,true\);/,
    to: 'if(Math.hypot(e.x-P.x,e.y-P.y)<rad){ hurtEnemy(e,70*P.burstDmg,P.aim,420,true,{src:"burst"});' },
  { id: 'reset-healbudget', desc: '每次新 run 重置令牌桶与吸血计量',
    re: /G\.stopT=0;G\.started=true;/,
    to: 'G.stopT=0;G.started=true;G.hbTok=undefined;G.hbT=undefined;G.healGross=0;G.healSpent=0;' },
  { id: 'ui-dyn', desc: '升级卡 UI 实际显示动态增益（u.dyn(P) 优先）',
    re: /d\.innerHTML='<b>'\+u\.n\+'<\/b><span>'\+u\.d\+'<\/span>';/,
    to: "d.innerHTML='<b>'+u.n+'</b><span>'+(u.dyn?u.dyn(P):u.d)+'</span>';" },
  { id: 'ironwall-bucket-balance', desc: '铁壁：绝对桶余额 + clamp 到新 cap，不按比例白送容量、不追溯补充',
    re: /\{n:'铁壁',d:'最大生命 \+35 并立即回满',a:function\(p\)\{p\.maxHp\+=35;p\.hp=p\.maxHp;\}\}/,
    to: `{n:'铁壁',d:'最大生命 +35 并立即回满（恢复上限按新值 clamp，不追溯补充）',a:function(p){if(typeof G!=='undefined'){var __t=G.time||0;if(G.hbTok===undefined){G.hbTok=0;G.hbT=__t;}else{var __pt=(G.hbT===undefined||G.hbT===null)?__t:G.hbT;var __dt=Math.max(0,__t-__pt);G.hbTok=Math.min(0.06*p.maxHp,(G.hbTok||0)+0.12*p.maxHp*__dt);G.hbT=__t;}}p.maxHp+=35;p.hp=p.maxHp;if(typeof G!=='undefined'){var __c=0.06*p.maxHp;G.hbTok=Math.min(__c,(G.hbTok===undefined?0:G.hbTok));G.hbCap=__c;}}}` },
  { id: 'pool-cap-filter', desc: '到顶卡池过滤 + 有效 fallback（rate/range/life 已满不再给无效卡）',
    re: /var pool=UPS\.filter\(function\(u\)\{return u\.n!=='烈焰'\|\|!P\.explode;\}\);/,
    to: `var pool=UPS.filter(function(u){return (u.n!=='烈焰'||!P.explode)&&!(u.n==='疾风'&&P.rate>=2.2)&&!(u.n==='长臂'&&P.range>=180)&&!(u.n==='吸血鬼'&&P.life>=0.15);});\n  if(!pool.length){pool=[{n:'利刃',d:'斩击伤害 +28%',a:function(p){p.dmg*=1.28;}}];}` },
  { id: 'hud-heal-actual', desc: '真实玩家 HUD：rate/range/life 实际值 + 恢复容量/速率/gross',
    re: /function drawHUD\(\)\{/,
    to: `function drawHUD(){\n  (function(){try{var __id='m2hb';var d=document.getElementById(__id);if(!d){d=document.createElement('div');d.id=__id;d.style.cssText='position:fixed;left:8px;bottom:8px;z-index:9999;font:11px monospace;color:#9fe;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:4px';document.body.appendChild(d);}var __cap=0.06*P.maxHp;d.textContent='攻速 x'+P.rate.toFixed(2)+'/2.20　范围 '+Math.round(P.range)+'/180　吸血 '+(P.life*100).toFixed(0)+'%/15%　生命上限 '+Math.round(P.maxHp)+'　突发恢复额度 '+(0.06*P.maxHp).toFixed(1)+' 点；额度每游戏秒补充 '+(0.12*P.maxHp).toFixed(1)+' 点（不是保证实际恢复）　仅直接轻重斩击吸血・Boss 不吸　本局实际恢复 '+(G.healGross||0).toFixed(1);}catch(e){}})();` },
  { id: 'fix-double-rate-cooldown', desc: '修正双重 rate 缩放：melee 只除一次（atkCooldown 已含 /P.rate）',
    re: /P\.atkT=cooldown\/P\.rate/,
    to: 'P.atkT=cooldown' }
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
module.exports = { name: 'patch_m2_balance', apply, EDITS };
