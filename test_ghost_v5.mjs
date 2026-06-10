// Assertions for the Pass-3 efficiency rework + collapse edits.
// EDIT A: styleGaps returns {revise, det}; banned/em-dash live in det, never revise.
// EDIT B: recovery loop gated on meaningful strip (>5% of target).
// TASK 2: needsOutline predicate; selectAngle extracted; buildDraftPrompt angle param.
import { readFileSync } from 'fs';
import assert from 'assert';

const html = readFileSync('ghost-v5.html', 'utf-8');
const js = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/)[1];

// ── minimal DOM stub (same shape as the project harness) ──
const els = new Map();
const makeEl = id => ({ id, value:'', textContent:'', innerHTML:'', scrollTop:0, scrollHeight:0,
  style:new Proxy({},{get:()=>'' ,set:()=>true}),
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  dataset:{}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
  removeAttribute(){}, focus(){}, click(){}, querySelectorAll(){return [];} });
global.document = { getElementById(id){ if(!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  querySelectorAll(){return [];}, addEventListener(){}, createElement(){return makeEl('_dyn');} };
global.window = {};
Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
global.fetch = async () => { throw new TypeError('Failed to fetch (stub)'); };
global.FileReader = class {};
if(!global.AbortSignal?.timeout) global.AbortSignal = { timeout:()=>undefined };
document.getElementById('apiBase').value = 'http://localhost:11434/v1/';
document.getElementById('tempSlider').value = '0.78';
document.getElementById('repSlider').value = '1.12';
document.getElementById('topPSlider').value = '0.92';

const EXPORTS = ['styleGaps','analyzeStyle','needsOutline','selectAngle','buildDraftPrompt',
  'buildOutlinePrompt','PROFILES','getRegisterTarget'];
(0, eval)(js + `\n;globalThis.__G = { ${EXPORTS.join(', ')} };`);
const { styleGaps, analyzeStyle, needsOutline, selectAngle, buildDraftPrompt,
  PROFILES, getRegisterTarget } = globalThis.__G;

let pass=0, fail=0;
const t=(name,fn)=>{ try{ fn(); pass++; console.log('  \u2713',name);}catch(e){ fail++; console.log('  \u2717',name,'\u2014',e.message);} };

console.log('EDIT A \u2014 styleGaps split (revise vs det)');
t('styleGaps returns {revise, det} arrays', () => {
  const out = styleGaps(analyzeStyle('A short line. Another one here now.'), getRegisterTarget('direct-response'));
  assert.ok(out && Array.isArray(out.revise) && Array.isArray(out.det), 'shape {revise:[],det:[]}');
});
t('banned word goes to det, NOT revise', () => {
  // "leverage" + "seamless" are in BANNED_WORDS. Build text long enough to be measured.
  const txt = 'We leverage a seamless platform across the organization. '.repeat(8);
  const out = styleGaps(analyzeStyle(txt), getRegisterTarget('seo'));
  const joinRev = out.revise.join(' '), joinDet = out.det.join(' ');
  assert.ok(/SCRUBBER MISS \u2014 banned/.test(joinDet), 'banned flagged in det');
  assert.ok(!/banned AI words/i.test(joinRev) && !/Remove every one/i.test(joinRev), 'banned NOT in revise');
});
t('em-dash goes to det, NOT revise', () => {
  const txt = 'This is a sentence with an em dash \u2014 right here in the middle of it. '.repeat(6);
  const out = styleGaps(analyzeStyle(txt), getRegisterTarget('seo'));
  assert.ok(/SCRUBBER MISS \u2014 \d+ em-dash/.test(out.det.join(' ')), 'em-dash in det');
  assert.ok(!/em-dash/i.test(out.revise.join(' ')), 'em-dash NOT in revise');
});
t('aiPatterns STAYS in revise (LLM-actionable, not scrubber-owned)', () => {
  const txt = "The point is not that it failed, it's that nobody noticed. ".repeat(6);
  const out = styleGaps(analyzeStyle(txt), getRegisterTarget('ghost'));
  // Either it fires (anti-pattern) into revise, or not at all — but never into det.
  assert.ok(!/anti-pattern/i.test(out.det.join(' ')), 'anti-pattern never in det');
});

console.log('EDIT B \u2014 recovery gate on meaningful strip');
t('source has the >5% meaningful-strip guard', () => {
  assert.ok(/removedWords\s*=\s*preStripWords\s*-\s*strippedWords/.test(js), 'computes removedWords');
  assert.ok(/meaningfulStrip\s*=\s*removedWords\s*>\s*effectiveWC\s*\*\s*0\.05/.test(js), '5% threshold present');
  assert.ok(/!editorial\s*&&\s*strippedWords\s*<\s*recoveryFloor\s*&&\s*meaningfulStrip/.test(js), 'gate uses meaningfulStrip');
});
t('recovery loop still capped at 3 attempts', () => {
  assert.ok(/recoveryAttempts\s*<\s*3/.test(js), '3-attempt cap intact');
});

console.log('TASK 2 \u2014 collapse Pass 1 into Pass 2');
t('needsOutline true ONLY for seo and technical', () => {
  assert.strictEqual(needsOutline('seo'), true);
  assert.strictEqual(needsOutline('technical'), true);
  for (const id of ['direct-response','b2b-authority','brand-story','educator','academic','journalist','social','ghost'])
    assert.strictEqual(needsOutline(id), false, id + ' must not need outline');
});
t('needsOutline ids all exist in PROFILES', () => {
  const ids = new Set(PROFILES.map(p=>p.id));
  assert.ok(ids.has('seo') && ids.has('technical'), 'gate ids are real profiles');
});
t('selectAngle is an async function', () => {
  assert.strictEqual(typeof selectAngle, 'function');
  assert.strictEqual(selectAngle.constructor.name, 'AsyncFunction');
});
t('selectAngle swallows fetch failure -> returns "" (non-fatal)', async () => {
  // fetch stub throws TypeError (not Abort/auth), so selectAngle must resolve to ''.
  const r = await selectAngle('Headline', 'source', {temperature:.7,top_p:.9,repeat_penalty:1.1,num_predict:500});
  assert.strictEqual(r, '', 'non-fatal error yields empty angle');
});
t('buildDraftPrompt injects angle block when NO outline', () => {
  const p = buildDraftPrompt('', '', 1000, null, 'src', 'My sharp angle sentence.');
  assert.ok(/ANGLE \u2014 THE SPINE OF THE PIECE/.test(p), 'angle block present');
  assert.ok(/My sharp angle sentence\./.test(p), 'angle text injected');
});
t('buildDraftPrompt does NOT double-inject angle when outline present', () => {
  // outline already carries the angle (## ANGLE ...). angleBlock must stay empty.
  const outline = '## ANGLE\n- carried angle\n\n## KEY FACTS\n- x';
  const p = buildDraftPrompt('', '', 1000, outline, 'src', 'carried angle');
  const hits = (p.match(/ANGLE \u2014 THE SPINE OF THE PIECE/g) || []).length;
  assert.strictEqual(hits, 0, 'no injected spine block when outline present');
  assert.ok(/RESEARCH OUTLINE/.test(p), 'outline block present instead');
});
t('buildDraftPrompt with no outline and no angle = neither block', () => {
  const p = buildDraftPrompt('', '', 1000, null, 'src', '');
  assert.ok(!/ANGLE \u2014 THE SPINE/.test(p) && !/RESEARCH OUTLINE/.test(p), 'both blocks empty');
});

// allow async tests to settle
await new Promise(r => setTimeout(r, 50));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
