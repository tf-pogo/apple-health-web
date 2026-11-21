/** 深浅主题：默认浅色，选择存 localStorage，切换时从按键那一圈展开 */
const KEY = 'apple-health-theme';
const DUR = 560;
// 展开用 ease-out 才有"推出去"的手感，cubic-bezier(.4,0,.2,1) 太快收尾会显得顿
const EASE = 'cubic-bezier(.22, .61, .36, 1)';

export function currentTheme() {
  // ?theme=dark 方便截图和分享，不用手动点
  const q = new URLSearchParams(location.search).get('theme');
  if (q === 'light' || q === 'dark') return q;
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'light';
}

export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch {}
}

/** 圆要盖满整个视口：从原点到最远那个角 */
const farRadius = (x, y) => Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

/** 真实点击点。键盘 Enter/Space 触发的 click 里 clientX/Y 都是 0，
 *  直接拿去当圆心会从左上角展开，所以退回按钮中心。 */
function origin(btn, e) {
  if (e && (e.clientX || e.clientY)) return { x: Math.round(e.clientX), y: Math.round(e.clientY) };
  const r = btn.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}

/** Safari 到 18 才有 View Transitions，而且把动画挂到 ::view-transition-new 上
 *  这件事在 WebKit 上不稳，主场景又是 iPhone，所以 Safari 一律走自己画的降级。 */
function canSnapshot() {
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium|Edg\/|OPR\/|CriOS|FxiOS/.test(ua);
  return typeof document.startViewTransition === 'function' && !safari;
}

/** 降级（Safari）：把**新主题**的底色铺成一层，从一个点扩到整屏，铺满之后才真的换主题。
 *  关键是顺序 —— 先换主题再画，看到的就成了「旧色往里收」，方向正好相反。 */
let wiping = null;

function wipe(run, x, y, target) {
  // 目标主题的底色要在同一帧里临时切过去读，读完立刻切回来，浏览器不会画出中间态
  const cur = document.documentElement.dataset.theme || '';
  document.documentElement.dataset.theme = target;
  const bg = getComputedStyle(document.body).backgroundColor;
  const glow = getComputedStyle(document.documentElement).getPropertyValue('--glow-1').trim();
  document.documentElement.dataset.theme = cur;

  // 上一轮还没跑完就直接收掉，别叠两层
  document.querySelectorAll('.theme-wipe').forEach(n => n.remove());
  if (wiping) {
    if (wiping.a) {
      wiping.a.onfinish = null;
      wiping.a.oncancel = null;
      try { wiping.a.cancel(); } catch (e) {}
    }
    wiping = null;
  }

  const layer = document.createElement('div');
  layer.className = 'theme-wipe';
  layer.style.background =
    (glow ? 'radial-gradient(1100px 380px at 50% -140px, ' + glow + ', transparent 70%), ' : '') + bg;
  layer.style.clipPath = 'circle(0px at ' + x + 'px ' + y + 'px)';
  document.body.appendChild(layer);

  const far = farRadius(x, y);
  let a = null;
  try {
    a = layer.animate(
      [
        { clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)' },
        { clipPath: 'circle(' + far + 'px at ' + x + 'px ' + y + 'px)' },
      ],
      { duration: DUR, easing: EASE, fill: 'both' }
    );
  } catch (e) {
    // 万一这个引擎不放 clip-path 动画，就别把主题卡住：直接换掉
    run();
    layer.remove();
    return;
  }
  wiping = { a: a, layer: layer, target: target };

  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    run(); // 圆已经铺满整屏，这时候换主题看不出跳变
    if (layer.parentNode) layer.remove();
    if (wiping && wiping.layer === layer) wiping = null;
  };
  a.onfinish = done;
  setTimeout(() => { if (layer.parentNode) done(); }, DUR + 320); // 动画被吞掉也要收尾
}

/** 把按钮接上：图标随当前主题换，点击就地切换 */
export function initTheme(btn) {
  if (!btn) return;
  applyTheme(currentTheme());
  const paint = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const label = dark ? '切到浅色' : '切到深色';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  };
  paint();

  btn.addEventListener('click', e => {
    // 降级路径里主题是在动画结束时才换的，中途再点一次要知道「上一轮目标是哪个」，
    // 否则连点两下会算成同一个目标，等于没切
    const now = (wiping && wiping.target) || document.documentElement.dataset.theme;
    const next = now === 'dark' ? 'light' : 'dark';
    const { x, y } = origin(btn, e);
    const run = () => { applyTheme(next); paint(); };

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return run();
    if (!canSnapshot()) return wipe(run, x, y, next);

    const far = farRadius(x, y);
    const vt = document.startViewTransition(run);
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + far + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: DUR, easing: EASE, pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  });
}
