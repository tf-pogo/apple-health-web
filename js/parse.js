/** 流式文本行切分 + Apple Health XML 属性读取 */

/** 把字节流转成逐行产出，不缓存整文件 */
export async function* lines(stream) {
  const reader = stream.pipeThrough(new TextDecoderStream('utf-8')).getReader();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let idx = 0, cut;
    while ((cut = buf.indexOf('\n', idx)) !== -1) {
      yield buf.slice(idx, cut);
      idx = cut + 1;
    }
    buf = idx ? buf.slice(idx) : buf;
  }
  if (buf.length) yield buf;
}

export function unescapeXml(s) {
  if (!s || s.indexOf('&') === -1) return s;
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** 在字符串里找 key="value"，不构造对象，比正则快 */
export function attr(s, key) {
  const k = key + '="';
  const i = s.indexOf(k);
  if (i < 0) return '';
  const from = i + k.length;
  const j = s.indexOf('"', from);
  return j < 0 ? '' : s.slice(from, j);
}

/** <<HKDevice: 0x.., name:AirPods Pro, manufacturer:Apple Inc., ...>> → AirPods Pro */
const devCache = new Map();
export function deviceName(raw) {
  if (!raw) return '';
  const hit = devCache.get(raw);
  if (hit !== undefined) return hit;
  const m = /name:([^,>]+)/.exec(unescapeXml(raw));
  const v = m ? m[1].trim() : '';
  devCache.set(raw, v);
  return v;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;

/** "2026-05-18 19:29:08 +0800" → 毫秒时间戳 */
export function parseDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) return NaN;
  const off = (m[7] === '-' ? -1 : 1) * (m[8] * 60 + +m[9]);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000;
}

/** 睡眠归属：中午 12 点前开始的算前一天，一晚的碎片才能拼到一起 */
export function sleepNightKey(startStr) {
  const d = startStr.slice(0, 10);
  const h = +startStr.slice(11, 13);
  if (h >= 12) return d;
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

export function dayKey(dateStr) {
  return (dateStr || '').slice(0, 10);
}
