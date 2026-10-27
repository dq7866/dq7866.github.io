/**
 * 管理员口令的存储与校验
 *
 * 为什么不用明文：
 *   旧实现把密码原文写进 data/admin/auth.json。局域网里任何人拿到这个文件
 *   （或备份、或构建产物）就等于拿到后台的完全控制权——能改题库、能导出全部数据。
 *   现在改成 scrypt + 随机 salt 存储，文件里没有任何可还原的口令。
 *
 * 兼容：旧文件是 { password: "xxx" } 明文格式，启动时自动识别并原地升级，
 *      升级后原文件不再含口令明文。
 */
import crypto from 'node:crypto';

const KEYLEN = 64;

/** 生成一条口令记录：{ algo, salt, hash, updatedAt } */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN).toString('hex');
  return { algo: 'scrypt', salt, hash, updatedAt: Date.now() };
}

/** 校验口令；记录格式不对时返回 false（不抛错，避免把内部细节泄给前端） */
export function verifyPassword(plain, rec) {
  if (!rec || typeof rec !== 'object') return false;
  if (rec.algo === 'scrypt' && rec.salt && rec.hash) {
    let calc;
    try {
      calc = crypto.scryptSync(String(plain), rec.salt, KEYLEN);
    } catch {
      return false;
    }
    const known = Buffer.from(rec.hash, 'hex');
    // 长度不等时 timingSafeEqual 会抛错，先挡掉
    if (known.length !== calc.length) return false;
    return crypto.timingSafeEqual(known, calc);
  }
  // 旧格式：明文口令
  if (typeof rec.password === 'string') {
    const a = Buffer.from(String(plain));
    const b = Buffer.from(rec.password);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  return false;
}

/** 这条记录是不是旧明文格式（需要升级） */
export function isLegacyPlaintext(rec) {
  return !!(rec && typeof rec === 'object' && typeof rec.password === 'string');
}
