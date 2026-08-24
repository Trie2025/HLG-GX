// HLG(help-Luogu) CRX v3 打包脚本（自包含+自校验）
// 用法: node make-crx.js [扩展目录] [输出crx] [输出zip] [私钥路径]
// 默认: extension/ -> HLG.crx + hhoj.zip, 私钥 ./hlg.pem
// 说明: 用 Node 内置 zlib 生成标准 ZIP，避免 PowerShell Compress-Archive 产生的
//       ZIP 被 Chrome 严格解析器判为 CRX_HEADER_INVALID。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const extDir = path.resolve(process.argv[2] || 'extension');
const crxOut = path.resolve(process.argv[3] || 'HLG.crx');
const zipOut = path.resolve(process.argv[4] || 'hhoj.zip');
const keyPath = path.resolve(process.argv[5] || path.join(__dirname, 'hlg.pem'));

// ---------- 收集扩展目录文件 ----------
function collectFiles(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = (base ? base + '/' : '') + name;
    if (fs.statSync(full).isDirectory()) {
      out.push(...collectFiles(full, rel));
    } else {
      out.push({ name: rel, data: fs.readFileSync(full) });
    }
  }
  return out;
}
const files = collectFiles(extDir, '');
if (!files.some((f) => f.name === 'manifest.json')) {
  throw new Error(extDir + ' 中未找到 manifest.json');
}

// ---------- 生成标准 ZIP ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function buildZip(list) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const f of list) {
    const compressed = zlib.deflateRawSync(f.data);
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);   // local file header signature
    lh.writeUInt16LE(20, 4);           // version needed
    lh.writeUInt16LE(0, 6);            // flags (no data descriptor)
    lh.writeUInt16LE(8, 8);            // method = deflate
    lh.writeUInt16LE(0, 10);           // mod time
    lh.writeUInt16LE(0, 12);           // mod date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compressed.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);           // extra length
    const local = Buffer.concat([lh, nameBuf, compressed]);
    localParts.push(local);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);   // central directory signature
    ch.writeUInt16LE(20, 4);           // version made by
    ch.writeUInt16LE(20, 6);           // version needed
    ch.writeUInt16LE(0, 8);            // flags
    ch.writeUInt16LE(8, 10);           // method
    ch.writeUInt16LE(0, 12);           // time
    ch.writeUInt16LE(0, 14);           // date
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compressed.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);           // extra len
    ch.writeUInt16LE(0, 32);           // comment len
    ch.writeUInt16LE(0, 34);           // disk number
    ch.writeUInt16LE(0, 36);           // internal attrs
    ch.writeUInt32LE(0, 38);           // external attrs
    ch.writeUInt32LE(offset, 42);      // local header offset
    centralParts.push(Buffer.concat([ch, nameBuf]));

    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);   // end of central dir signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(list.length, 8);
  eocd.writeUInt16LE(list.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, eocd]);
}
const zip = buildZip(files);

// ---------- 加载/生成 RSA-2048 私钥 ----------
let privateKey;
if (fs.existsSync(keyPath)) {
  privateKey = fs.readFileSync(keyPath, 'utf8');
} else {
  const { privateKey: pk } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  fs.writeFileSync(keyPath, pk);
  console.log('已生成新私钥: ' + keyPath);
  privateKey = pk;
}
const pubKeyDer = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });

// ---------- protobuf 工具 ----------
function varint(n) {
  const out = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
  return Buffer.from(out);
}
function fieldBytes(fieldNum, bytes) {
  const tag = varint((fieldNum << 3) | 2);
  const len = varint(bytes.length);
  return Buffer.concat([tag, len, bytes]);
}

// ---------- 组装 CRX3 ----------
const magic = Buffer.from('Cr24', 'ascii');
const crxVersion = Buffer.from([3, 0, 0, 0]);
// crx_id 必须为 public key 的 SHA-256 前 16 字节（Chrome 用其推导扩展 ID 并校验）
const crxId = crypto.createHash('sha256').update(pubKeyDer).digest().slice(0, 16);

// SignedData{ crx_id }，作为 CrxFileHeader 的 field 10000（signed_header_data）
const signedHeaderData = fieldBytes(1, crxId);
function fieldBytesByNum(fieldNum, bytes) {
  return Buffer.concat([varint((fieldNum << 3) | 2), varint(bytes.length), bytes]);
}

const sigLen = 256;
const sigPlaceholder = Buffer.alloc(sigLen);
function buildHeader(sig) {
  // sha256_with_rsa（field 2）= AsymmetricKeyProof{ public_key=1, signature=2 }
  const proofInner = Buffer.concat([fieldBytes(1, pubKeyDer), fieldBytes(2, sig)]);
  const proof = Buffer.concat([varint((2 << 3) | 2), varint(proofInner.length), proofInner]);
  // signed_header_data（field 10000）
  const shd = fieldBytesByNum(10000, signedHeaderData);
  return Buffer.concat([proof, shd]);
}
const headerPlaceholder = buildHeader(sigPlaceholder);
const headerSizeBuf = Buffer.alloc(4);
headerSizeBuf.writeUInt32LE(headerPlaceholder.length, 0);

// 签名覆盖（与 Chrome crx_verifier.cc 一致）:
//   "CRX3 SignedData\x00" + LE32(signed_header_size) + signed_header_data + archive(zip)
const sigContext = Buffer.from('CRX3 SignedData\x00', 'utf8');
const signedHeaderSizeBuf = Buffer.alloc(4);
signedHeaderSizeBuf.writeUInt32LE(signedHeaderData.length, 0);
const toSign = Buffer.concat([sigContext, signedHeaderSizeBuf, signedHeaderData, zip]);
const signature = crypto.sign('sha256', toSign, privateKey);
const header = buildHeader(signature);
if (header.length !== headerPlaceholder.length) throw new Error('header 长度不一致');

const crx = Buffer.concat([magic, crxVersion, headerSizeBuf, header, zip]);
console.log('[dbg] header hex:', header.slice(0, 40).toString('hex'));

// ---------- 自校验：重新解析 header 并验证签名 ----------
function readVarint(buf, off) {
  let result = 0, shift = 0, b;
  do {
    b = buf[off++];
    result |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return { value: result, next: off };
}
function parseField(buf, off) {
  const { value: tag, next } = readVarint(buf, off);
  const { value: len, next: n2 } = readVarint(buf, next);
  return { fieldNum: tag >> 3, len, dataStart: n2, next: n2 + len };
}
const headerSize = crx.readUInt32LE(8);
const hStart = 12;
let p = hStart;
let pubInHeader = null, sigInHeader = null, signedHeaderDataInHeader = null;
while (p < hStart + headerSize) {
  const f = parseField(crx, p);
  if (f.fieldNum === 2) {
    // AsymmetricKeyProof
    let q = f.dataStart;
    while (q < f.next) {
      const sf = parseField(crx, q);
      if (sf.fieldNum === 1) pubInHeader = crx.slice(sf.dataStart, sf.next);
      if (sf.fieldNum === 2) sigInHeader = crx.slice(sf.dataStart, sf.next);
      q = sf.next;
    }
  } else if (f.fieldNum === 10000) {
    signedHeaderDataInHeader = crx.slice(f.dataStart, f.next);
  }
  p = f.next;
}
// 用与打包完全一致的签名数据重新计算并验证
const verifySign = Buffer.concat([
  Buffer.from('CRX3 SignedData\x00', 'utf8'),
  signedHeaderSizeBuf,
  signedHeaderDataInHeader,
  zip
]);
console.log('[dbg] pubInHeader len:', pubInHeader && pubInHeader.length, 'sigInHeader len:', sigInHeader && sigInHeader.length, 'signedHeaderData len:', signedHeaderDataInHeader && signedHeaderDataInHeader.length);
const valid = crypto.verify('sha256', verifySign, { key: privateKey, format: 'pem', type: 'pkcs8' }, sigInHeader);
const pubMatch = pubInHeader && pubInHeader.equals(pubKeyDer);

// ---------- 输出 ----------
fs.writeFileSync(crxOut, crx);
fs.writeFileSync(zipOut, zip);
const extId = (() => {
  const h = crypto.createHash('sha256').update(pubKeyDer).digest();
  const chars = 'abcdefghijklmnop';
  let id = '';
  for (let i = 0; i < 16; i++) id += chars[h[i] >> 4] + chars[h[i] & 0xf];
  return id;
})();

console.log('文件数: ' + files.length);
console.log('ZIP大小: ' + (zip.length / 1024).toFixed(2) + ' KB');
console.log('CRX大小: ' + (crx.length / 1024).toFixed(2) + ' KB');
console.log('签名校验: ' + (valid ? '通过' : '失败'));
console.log('公钥一致: ' + (pubMatch ? '是' : '否'));
console.log('扩展ID: ' + extId);
console.log('已生成: ' + crxOut + '  /  ' + zipOut);
if (!valid || !pubMatch) throw new Error('自校验失败');