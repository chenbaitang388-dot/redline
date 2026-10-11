'use strict';
/* GAME-003 独立构建器（redline-v3）
   流程：读**已校验基线** game-v1.1.html（断言其 SHA256 = 正式页）→ 依次应用 v2 补丁 → 写 game-v3.html。
   保证：① 不改基线文件；② 输出只写新文件；③ 每条补丁报命中数，missed 必须显式列出；④ 可重复（同输入同输出）。
   用法：node src/build_v2.js   （cwd = work/redline-v3） */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'game-v1.1.html');
const OUT = path.join(ROOT, 'game-v3.html');
const EXPECT_BASE = 'a2980ea59588174878f1cccb359637e22f692cab83041c884362874971748070';

const baseBuf = fs.readFileSync(BASE);
const baseSha = sha(baseBuf);
if (baseSha !== EXPECT_BASE) {
  console.error('BASELINE-MISMATCH ' + baseSha + ' != ' + EXPECT_BASE + ' → 拒绝构建（不改基线）');
  process.exit(2);
}
const patches = [require('./patch_v20_game002.js')];
if (process.env.M2 === '1') patches.push(require('./patch_m2_balance.js'));
if (process.env.M3 !== '0') patches.push(require('./patch_m3_game002.js'));
let html = baseBuf.toString('utf8');
const report = { kind: 'redline-v3-build', base: { file: 'game-v1.1.html', sha256: baseSha, bytes: baseBuf.length }, patches: [], missed: [] };
for (const p of patches) {
  const r = p.apply(html);
  /* 任一补丁未命中 → **throw，不写任何产物**（不半应用） */
  if (r.ok === false) {
    console.error('PATCH-MISSED ' + p.name + ' :: ' + r.missed.map(m => m.id).join(',') + ' → 拒绝构建，不写产物');
    fs.writeFileSync(path.join(ROOT, 'build-v2-report.json'), JSON.stringify({ kind: 'redline-v3-build', failed: 'patch-missed', patch: p.name, missed: r.missed }, null, 2), 'utf8');
    process.exit(4);
  }
  html = r.html;
  report.alreadySatisfied = report.alreadySatisfied || [];
  for (const a of (r.already || [])) report.alreadySatisfied.push({ patch: p.name, id: a.id, desc: a.desc, note: a.note });
  report.patches.push({ name: p.name, edits: r.edits });
  for (const m of (r.missed || [])) report.missed.push({ patch: p.name, id: m.id, desc: m.desc, expect: m.expect });
}
fs.writeFileSync(OUT, Buffer.from(html, 'utf8'));
const outBuf = fs.readFileSync(OUT);
report.out = { file: 'game-v3.html', sha256: sha(outBuf), bytes: outBuf.length };
report.idempotentCheck = (function () {                 /* 重复应用应得同一结果 */
  let h2 = baseBuf.toString('utf8');
  for (const p of patches) h2 = p.apply(h2).html;
  return sha(Buffer.from(h2, 'utf8')) === report.out.sha256;
})();
report.baselineUnchanged = sha(fs.readFileSync(BASE)) === EXPECT_BASE;
const rp = path.join(ROOT, 'build-v2-report.json');
fs.writeFileSync(rp, JSON.stringify(report, null, 2), 'utf8');

console.log('base  ' + report.base.sha256.slice(0, 32) + '  (' + report.base.bytes + ' B)');
report.patches.forEach(p => p.edits.forEach(e => console.log('  edit ' + e.id + ' x' + e.count + '  ' + e.desc)));
if (report.missed.length) report.missed.forEach(m => console.log('  MISSED ' + m.id + ' (expect ' + m.expect + ')'));
console.log('out   ' + report.out.sha256.slice(0, 32) + '  (' + report.out.bytes + ' B)');
console.log('idempotent=' + report.idempotentCheck + '  baselineUnchanged=' + report.baselineUnchanged + '  missed=' + report.missed.length);
console.log('report -> build-v2-report.json');
