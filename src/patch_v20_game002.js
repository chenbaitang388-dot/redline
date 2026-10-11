'use strict';
/* GAME-002 v2 独立补丁（redline-v2 专用；**不改生成页基线**）
   规则：每条编辑必须**报实际命中数**；命中 0 → 记入 missed（不静默、不伪称完成）。
   用法：由 src/build_v2.js 调用；本文件不写任何文件。 */
const EDITS = [
  {
    id: 'assert-ai-locked',
    /* 原源码 AI_RELEASED=1 即**已锁 AI 入口**（走"暂未开放"分支，不访问 CTRL）。
       改为 0 会走 else→ctrlIsAI→syncBtns 在 const CTRL 之前执行 → TDZ（实测已复现）。
       因此本规则**只断言基线已锁**，不做修改；命中即 already-satisfied。 */
    desc: '断言 AI 入口已锁（AI_RELEASED=1），不改写该常量',
    re: /const AI_RELEASED=0;/g,
    to: 'const AI_RELEASED=0;',
    expect: 0,
    already: /const AI_RELEASED=1;/
  },
  {
    id: 'version-mark',
    desc: '写入新版版本标记（**追加到文件末尾**，避免落在页面脚本内部）',
    re: /$/,
    to: '\n<script>window.__REDLINE_BUILD__={edition:"redline-v2",game002:true,ai:false};</script>\n',
    expect: 1
  },
  {
    id: 'edition-marker',
    desc: '追加新版身份标记（文件末尾；供宿主自检读取 edition/ai 状态）',
    re: /$/,
    to: '\n<script>window.__REDLINE_BUILD__={edition:"redline-v2",game002:true,ai:false,aiLocked:true};</script>\n',
    expect: 1
  },
  {
    id: 'title-v2',
    desc: '页面标题标注新版（赤刃·重铸v2 实验版）',
    re: /<title>[^<]{0,80}<\/title>/,
    to: '<title>赤刃·重铸v2 实验版</title>',
    expect: 1
  }
];

function apply(html) {
  let out = html;
  const edits = [], missed = [], already = [];
  for (const e of EDITS) {
    /* 用 global 替换回调计数：避免 .match() 对非 global 正则只计首条、且把捕获组算成次数 */
    let n = 0;
    out = out.replace(e.re, function () {
      n++;
      const a = arguments;                                  /* 回调不展开 $1 → 手动展开捕获组 */
      return e.to.replace(/\$(\d)/g, function (m, i) { return a[+i] === undefined ? '' : a[+i]; });
    });
    if (n > 0) edits.push({ id: e.id, desc: e.desc, count: n });
    else if (e.already && e.already.test(out)) already.push({ id: e.id, desc: e.desc, note: 'already-satisfied' });
    else missed.push({ id: e.id, desc: e.desc, expect: e.expect, count: 0 });
  }
  return { html: out, edits, missed, already };
}
module.exports = { name: 'patch_v20_game002', apply, EDITS };
