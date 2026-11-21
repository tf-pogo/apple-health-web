/** 深浅主题：默认浅色，选择存 localStorage，切换时从点击处圆形展开 */
const KEY = 'apple-health-theme';

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
    const x = e.clientX, y = e.clientY;
    // 圆要盖满整个视口：取点击点到最远那个角
    const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const run = () => { applyTheme(next); paint(); };

    if (!document.startViewTransition ||
        matchMedia('(prefers-reduced-motion: reduce)').matches) return run();

    const vt = document.startViewTransition(run);
    vt.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            'circle(0px at ' + x + 'px ' + y + 'px)',
            'circle(' + far + 'px at ' + x + 'px ' + y + 'px)',
          ],
        },
        {
          duration: 520,
          easing: 'cubic-bezier(.4, 0, .2, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    }).catch(() => {});
  });
}
