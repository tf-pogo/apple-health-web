/**
 * 零依赖 ZIP 读取器。
 * 只做 Apple Health 导出包需要的事：定位条目、流式解压。
 * 不做 ZIP64（Apple 导出不会超 4 GB）。
 */

const EOCD_SIG = 0x06054b50;
const CEN_SIG  = 0x02014b50;
const LOC_SIG  = 0x04034b50;

async function u8(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function dv(buf) {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** 从尾部 64 KB 里找 EOCD，处理有注释的情况 */
async function findEocd(file) {
  const tailLen = Math.min(file.size, 65557);
  const head = await u8(file.slice(file.size - tailLen));
  const v = dv(head);
  for (let i = head.length - 22; i >= 0; i--) {
    if (v.getUint32(i, true) === EOCD_SIG) {
      return {
        cdSize: v.getUint32(i + 12, true),
        cdOffset: v.getUint32(i + 16, true),
        count: v.getUint16(i + 10, true),
      };
    }
  }
  throw new Error('不是有效的 ZIP 文件（找不到中央目录）');
}

/**
 * 打开 ZIP，返回条目表。
 * @param {File|Blob} file
 */
export async function openZip(file) {
  const { cdSize, cdOffset, count } = await findEocd(file);
  const cd = await u8(file.slice(cdOffset, cdOffset + cdSize));
  const v = dv(cd);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (v.getUint32(p, true) !== CEN_SIG) break;
    const method  = v.getUint16(p + 10, true);
    const csize   = v.getUint32(p + 20, true);
    const usize   = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extLen  = v.getUint16(p + 30, true);
    const cmtLen  = v.getUint16(p + 32, true);
    const localOff= v.getUint32(p + 42, true);
    const name = new TextDecoder('utf-8').decode(cd.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, csize, usize, localOff });
    p += 46 + nameLen + extLen + cmtLen;
  }
  return new ZipFile(file, entries);
}

export class ZipFile {
  constructor(file, entries) {
    this.file = file;
    this.entries = entries;
    this.byName = new Map(entries.map(e => [e.name, e]));
  }

  /** 模糊找一个条目，绕过解压出的目录名前缀 */
  find(suffix) {
    const want = suffix.toLowerCase();
    for (const e of this.entries) {
      if (e.name.toLowerCase().endsWith(want)) return e;
    }
    return null;
  }

  findAll(re) {
    return this.entries.filter(e => re.test(e.name));
  }

  /** 读出条目的原始字节（小文件用，比如 GPX / CSV） */
  async bytes(entry) {
    const e = typeof entry === 'string' ? this.find(entry) : entry;
    if (!e) throw new Error('条目不存在');
    const start = await this.dataStart(e);
    const blob = this.file.slice(start, start + e.csize);
    if (e.method === 0) return new Uint8Array(await blob.arrayBuffer());
    const stream = blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** 读出文本（小文件用） */
  async text(entry) {
    const e = typeof entry === 'string' ? this.find(entry) : entry;
    return new TextDecoder('utf-8').decode(await this.bytes(e));
  }

  /** 流：大文件必须走这里，不然内存撑不住 */
  async stream(entry) {
    const e = typeof entry === 'string' ? this.find(entry) : entry;
    const start = await this.dataStart(e);
    const blob = this.file.slice(start, start + e.csize);
    if (e.method === 0) return blob.stream();
    return blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  }

  /** 读本地头，算出数据真正的起点 */
  async dataStart(e) {
    const head = await u8(this.file.slice(e.localOff, e.localOff + 30));
    const v = dv(head);
    if (v.getUint32(0, true) !== LOC_SIG) throw new Error('本地头损坏: ' + e.name);
    return e.localOff + 30 + v.getUint16(26, true) + v.getUint16(28, true);
  }
}
