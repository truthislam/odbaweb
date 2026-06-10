// Assertions for the Social Post Composer (left-column build).
// PLATFORM_RULES static constants, buildSocialPrompt purity, char counting,
// over-limit logic, UI wiring, and init rendering.
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

const EXPORTS = ['PLATFORM_RULES','getPlatformRule','buildSocialPrompt','socialCharCount',
  'socialOverLimit','initSocial','selectSocialPlatform','updateScCount','PROFILES',
  'sharedRules1to28','BANNED_WORDS_DISPLAY'];
const fn = new Function(js + '\nreturn {' + EXPORTS.map(e=>`${e}:typeof ${e}!=='undefined'?${e}:undefined`).join(',') + '};');
const G = fn();

let pass = 0, fail = 0;
function t(name, f){ try { f(); console.log('  \u2713 ' + name); pass++; }
  catch(e){ console.log('  \u2717 ' + name + ' \u2014 ' + e.message); fail++; } }

// ── PLATFORM_RULES shape & verified constants ──
t('PLATFORM_RULES has a dated reviewed field (YYYY-MM)', () => {
  assert.match(G.PLATFORM_RULES.reviewed, /^\d{4}-\d{2}$/);
});
t('exactly 4 platforms: x, linkedin, instagram, facebook', () => {
  assert.deepStrictEqual(G.PLATFORM_RULES.platforms.map(p=>p.id).sort(),
    ['facebook','instagram','linkedin','x']);
});
t('every platform carries hardLimit/hookChars/target/hashtags/aspect/delta/baseProfile', () => {
  for (const p of G.PLATFORM_RULES.platforms) {
    assert.ok(Number.isInteger(p.hardLimit) && p.hardLimit > 0, p.id+' hardLimit');
    assert.ok(Number.isInteger(p.hookChars) && p.hookChars > 0, p.id+' hookChars');
    assert.ok(Array.isArray(p.target) && p.target.length===2 && p.target[0] < p.target[1], p.id+' target');
    assert.ok(Array.isArray(p.hashtags) && p.hashtags.length===2, p.id+' hashtags');
    assert.ok(typeof p.aspect === 'string' && p.aspect.length, p.id+' aspect');
    assert.ok(typeof p.delta === 'string' && p.delta.includes('PLATFORM:'), p.id+' delta');
    assert.ok(typeof p.baseProfile === 'string', p.id+' baseProfile');
  }
});
t('baseProfile ids resolve to real PROFILES entries (x/ig/fb \u2192 social, linkedin \u2192 b2b-authority)', () => {
  const ids = new Set(G.PROFILES.map(p=>p.id));
  for (const p of G.PLATFORM_RULES.platforms) assert.ok(ids.has(p.baseProfile), p.id);
  assert.strictEqual(G.getPlatformRule('linkedin').baseProfile, 'b2b-authority');
  for (const id of ['x','instagram','facebook'])
    assert.strictEqual(G.getPlatformRule(id).baseProfile, 'social');
});
t('web-verified limits encoded: X 280, LinkedIn 3000/210, IG 2200/125/30-implied, FB 63206/477', () => {
  assert.strictEqual(G.getPlatformRule('x').hardLimit, 280);
  assert.strictEqual(G.getPlatformRule('linkedin').hardLimit, 3000);
  assert.strictEqual(G.getPlatformRule('linkedin').hookChars, 210);
  assert.strictEqual(G.getPlatformRule('instagram').hardLimit, 2200);
  assert.strictEqual(G.getPlatformRule('instagram').hookChars, 125);
  assert.ok(G.getPlatformRule('instagram').delta.includes('30'));
  assert.strictEqual(G.getPlatformRule('facebook').hardLimit, 63206);
  assert.strictEqual(G.getPlatformRule('facebook').hookChars, 477);
});
t('target ranges sit under hard caps', () => {
  for (const p of G.PLATFORM_RULES.platforms) assert.ok(p.target[1] < p.hardLimit, p.id);
});
t('getPlatformRule: unknown id returns null', () => {
  assert.strictEqual(G.getPlatformRule('tiktok'), null);
});

// ── buildSocialPrompt purity & content ──
t('buildSocialPrompt returns {system, user, rule}; unknown platform \u2192 null', () => {
  const b = G.buildSocialPrompt('x', 'test brief', [], '');
  assert.ok(b && typeof b.system === 'string' && typeof b.user === 'string' && b.rule.id === 'x');
  assert.strictEqual(G.buildSocialPrompt('nope', 'b', [], ''), null);
});
t('system stacks: base profile prompt + platform delta + banned-words list + output lock', () => {
  const b = G.buildSocialPrompt('linkedin', 'brief', [], '');
  const prof = G.PROFILES.find(p=>p.id==='b2b-authority');
  assert.ok(b.system.includes(prof.prompt.slice(0, 60)), 'profile prompt');
  assert.ok(b.system.includes('PLATFORM: LinkedIn'), 'delta');
  assert.ok(b.system.includes(G.BANNED_WORDS_DISPLAY.slice(0, 40)), 'banned words');
  assert.ok(b.system.includes('the post text only'), 'output lock');
});
t('system uses the RELAXED sentence register (sharedRules1to28(true))', () => {
  const relaxed = G.sharedRules1to28(true), strict = G.sharedRules1to28(false);
  // find a chunk present in relaxed but not strict
  let probe = null;
  for (let i = 0; i + 60 < relaxed.length; i += 30) {
    const c = relaxed.slice(i, i + 60);
    if (!strict.includes(c)) { probe = c; break; }
  }
  assert.ok(probe, 'relaxed and strict variants must differ');
  const b = G.buildSocialPrompt('x', 'brief', [], '');
  assert.ok(b.system.includes(probe), 'system should embed relaxed variant');
  });
t('user carries brief + keywords block only when keywords given + no-fabrication line', () => {
  const withK = G.buildSocialPrompt('instagram', 'estate planning for executors', ['estate tax', 'trustee'], '');
  assert.ok(withK.user.includes('estate planning for executors'));
  assert.ok(withK.user.includes('KEYWORDS') && withK.user.includes('estate tax, trustee'));
  assert.ok(withK.user.includes('Do not invent statistics'));
  const noK = G.buildSocialPrompt('instagram', 'brief only', [], '');
  assert.ok(!noK.user.includes('KEYWORDS'));
});
t('voice fingerprint lands in system when provided', () => {
  const v = 'My distinctive sample sentence rhythm here.';
  const b = G.buildSocialPrompt('facebook', 'brief', [], v);
  assert.ok(b.system.includes(v));
});

// ── char counting & over-limit ──
t('socialCharCount counts code points (emoji = 1, not 2)', () => {
  assert.strictEqual(G.socialCharCount('\u{1F4A1}'.repeat(10)), 10);
  assert.strictEqual(G.socialCharCount('abc'), 3);
});
t('socialOverLimit: 280 ok on X, 281 over; emoji-280 not over', () => {
  const x = G.getPlatformRule('x');
  assert.strictEqual(G.socialOverLimit('a'.repeat(280), x), false);
  assert.strictEqual(G.socialOverLimit('a'.repeat(281), x), true);
  assert.strictEqual(G.socialOverLimit('\u{1F4A1}'.repeat(280), x), false);
});

// ── UI wiring & init ──
t('composer ids present in markup: scPlatforms/scRules/scGenBtn/scOut/scCount/scImgInput/scImgPreviewWrap', () => {
  for (const id of ['scPlatforms','scRules','scGenBtn','scOut','scCount','scImgInput','scImgPreviewWrap'])
    assert.ok(html.includes(`id="${id}"`), id);
});
t('initSocial renders 4 platform buttons', () => {
  G.initSocial();
  const inner = els.get('scPlatforms').innerHTML;
  assert.strictEqual((inner.match(/sc-plat-btn/g) || []).length, 4);
  for (const id of ['x','linkedin','instagram','facebook'])
    assert.ok(inner.includes(`data-plat="${id}"`), id);
});
t('selectSocialPlatform writes the rules line with cap + reviewed date', () => {
  G.selectSocialPlatform('x');
  const txt = els.get('scRules').textContent;
  assert.ok(txt.includes('280') && txt.includes(G.PLATFORM_RULES.reviewed) && txt.includes('static'));
});
t('updateScCount renders n / cap after a platform is selected', () => {
  els.get('scOut').value = 'hello world';
  G.updateScCount();
  assert.ok(els.get('scCount').textContent.includes('11 / 280'));
});
t('image input is preview-only: file never serialized into a prompt or fetch body', () => {
  // static guarantee: no FileReader/base64 path touches the sc image, and
  // scImagePick only ever builds an object URL.
  const sc = js.slice(js.indexOf('function scImagePick'), js.indexOf('function scClearImage'));
  assert.ok(sc.includes('createObjectURL') && !sc.includes('readAsDataURL') && !sc.includes('fetch('));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
