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

/** 降级：铺一层旧底色盖住整页，再从原点收回去 —— 露出来的就是已经换好的新主题。
 *  先把 layer 盖上再换主题，过程中不会闪。 */
function wipe(run, x, y) {
  const bg = getComputedStyle(document.body).backgroundColor;
  const glow = getComputedStyle(document.documentElement).getPropertyValue('--glow-1').trim();
  const far = farRadius(x, y);

  const layer = document.createElement('div');
  layer.className = 'theme-wipe';
  layer.style.background =
    (glow ? 'radial-gradient(1100px 380px at 50% -140px, ' + glow + ', transparent 70%), ' : '') + bg;
  document.body.appendChild(layer);

  run();

  const a = layer.animate(
    [
      { clipPath: 'circle(' + far + 'px at ' + x + 'px ' + y + 'px)', opacity: 1 },
      { clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)', opacity: .92 },
    ],
    { duration: DUR, easing: EASE, fill: 'both' }
  );
  const done = () => layer.remove();
  a.onfinish = done;
  a.oncancel = done;
  setTimeout(done, DUR + 300); // 动画被打断也要收掉，别留一层盖着页面
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
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    const { x, y } = origin(btn, e);
    const run = () => { applyTheme(next); paint(); };

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return run();
    if (!canSnapshot()) return wipe(run, x, y);

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
