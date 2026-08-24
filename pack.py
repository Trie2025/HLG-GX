# HLG(help-Luogu) CRX v3 打包脚本（Python 版，复刻 make-crx.js；因本机无 node）
# 用法: python pack.py [扩展目录] [输出crx] [输出zip] [私钥路径]
# 默认: extension/ -> HLG.crx + hhoj.zip, 私钥 ./hlg.pem
import sys, os, io, hashlib, struct, zipfile
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

def resolve(p, default):
    return os.path.abspath(p if p else default)

extDir  = resolve(sys.argv[1] if len(sys.argv) > 1 else None, 'extension')
crxOut  = resolve(sys.argv[2] if len(sys.argv) > 2 else None, 'HLG.crx')
zipOut  = resolve(sys.argv[3] if len(sys.argv) > 3 else None, 'hhoj.zip')
keyPath = resolve(sys.argv[4] if len(sys.argv) > 4 else None, 'hlg.pem')

# ---------- 收集扩展目录文件 ----------
def collect_files(dir_, base=''):
    out = []
    for name in sorted(os.listdir(dir_)):
        full = os.path.join(dir_, name)
        rel = (base + '/' if base else '') + name
        if os.path.isdir(full):
            out.extend(collect_files(full, rel))
        else:
            with open(full, 'rb') as f:
                out.append((rel, f.read()))
    return out
files = collect_files(extDir)
if not any(n == 'manifest.json' for n, _ in files):
    raise SystemExit(extDir + ' 中未找到 manifest.json')

# ---------- 生成标准 ZIP（zipfile 带 UTF-8 文件名 + deflate） ----------
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, data in files:
        zi = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, data)
buf.seek(0)
zip_bytes = buf.read()

# ---------- 加载/复用 RSA-2048 私钥 ----------
if not os.path.exists(keyPath):
    raise SystemExit('缺少私钥 ' + keyPath + '（为保持扩展 ID 稳定，请使用 hlg.pem）')
with open(keyPath, 'rb') as f:
    priv = serialization.load_pem_private_key(f.read(), password=None)
pub_der = priv.public_key().public_bytes(
    serialization.Encoding.DER,
    serialization.PublicFormat.SubjectPublicKeyInfo)

# ---------- protobuf 工具 ----------
def varint(n):
    out = bytearray()
    while n > 0x7f:
        out.append((n & 0x7f) | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out)
def field_bytes(field_num, data):
    return varint((field_num << 3) | 2) + varint(len(data)) + data

# ---------- 组装 CRX3 ----------
magic = b'Cr24'
crx_version = struct.pack('<I', 3)
crx_id = hashlib.sha256(pub_der).digest()[:16]
signed_header_data = field_bytes(1, crx_id)   # SignedData{ crx_id }  field 10000

def build_header(sig):
    proof_inner = field_bytes(1, pub_der) + field_bytes(2, sig)
    proof = varint((2 << 3) | 2) + varint(len(proof_inner)) + proof_inner  # AsymmetricKeyProof field 2
    shd = varint((10000 << 3) | 2) + varint(len(signed_header_data)) + signed_header_data
    return proof + shd

sig_len = 256
header_placeholder = build_header(b'\x00' * sig_len)
header_size_buf = struct.pack('<I', len(header_placeholder))

sig_context = b'CRX3 SignedData\x00'
signed_header_size_buf = struct.pack('<I', len(signed_header_data))
to_sign = sig_context + signed_header_size_buf + signed_header_data + zip_bytes
signature = priv.sign(to_sign, padding.PKCS1v15(), hashes.SHA256())
header = build_header(signature)
if len(header) != len(header_placeholder):
    raise SystemExit('header 长度不一致')
crx = magic + crx_version + header_size_buf + header + zip_bytes

# ---------- 自校验签名 ----------
def read_varint(b, off, end):
    result = 0; shift = 0
    while True:
        bi = b[off]; off += 1
        result |= (bi & 0x7f) << shift
        if not (bi & 0x80):
            break
        shift += 7
        if off > end:
            raise SystemExit('varint 越界')
    return result, off
def parse_field(b, off, end):
    tag, off = read_varint(b, off, end)
    ln, off = read_varint(b, off, end)
    return (tag >> 3), ln, off, off + ln
hsize = struct.unpack('<I', crx[8:12])[0]
hstart = 12
p = hstart
pub_in = None; sig_in = None; shd_in = None
while p < hstart + hsize:
    fnum, ln, data_start, nxt = parse_field(crx, p, hstart + hsize)
    if fnum == 2:
        q = data_start
        while q < nxt:
            sf, sl, sd, sn = parse_field(crx, q, nxt)
            if sf == 1: pub_in = crx[sd:sn]
            if sf == 2: sig_in = crx[sd:sn]
            q = sn
    elif fnum == 10000:
        shd_in = crx[data_start:nxt]
    p = nxt
verify_sign = sig_context + signed_header_size_buf + shd_in + zip_bytes
try:
    priv.public_key().verify(sig_in, verify_sign, padding.PKCS1v15(), hashes.SHA256())
    valid = True
except Exception:
    valid = False
pub_match = (pub_in == pub_der)

with open(crxOut, 'wb') as f: f.write(crx)
with open(zipOut, 'wb') as f: f.write(zip_bytes)

h = hashlib.sha256(pub_der).digest()
chars = 'abcdefghijklmnop'
ext_id = ''.join(chars[h[i] >> 4] + chars[h[i] & 0xf] for i in range(16))

print('文件数:', len(files))
print('ZIP大小:', round(len(zip_bytes) / 1024, 2), 'KB')
print('CRX大小:', round(len(crx) / 1024, 2), 'KB')
print('签名校验:', '通过' if valid else '失败')
print('公钥一致:', '是' if pub_match else '否')
print('扩展ID:', ext_id)
print('已生成:', crxOut, '/', zipOut)
if not valid or not pub_match:
    raise SystemExit('自校验失败')