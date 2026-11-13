import { createHmac, createPublicKey, sign, timingSafeEqual, verify, type KeyObject } from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function ed25519KeyFromRaw(raw: Buffer): KeyObject {
  if (raw.length !== 32) throw new Error('Clé Ed25519 : 32 octets attendus');
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}

/** Signature Telnyx : Ed25519 sur `timestamp|corps brut`. */
export function verifyTelnyxSignature(opts: {
  rawBody: Buffer | string;
  timestamp: string | undefined;
  signature: string | undefined;
  publicKeyBase64: string;
  nowMs?: number;
  toleranceSec?: number;
}): boolean {
  if (!opts.timestamp || !opts.signature || !opts.publicKeyBase64) return false;
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > (opts.toleranceSec ?? 300)) return false;
  const body = typeof opts.rawBody === 'string' ? opts.rawBody : opts.rawBody.toString('utf8');
  const message = Buffer.from(`${opts.timestamp}|${body}`);
  let key: KeyObject;
  try {
    key = ed25519KeyFromRaw(Buffer.from(opts.publicKeyBase64, 'base64'));
  } catch {
    return false;
  }
  const sig = Buffer.from(opts.signature, 'base64');
  try {
    return verify(null, message, key, sig);
  } catch {
    return false;
  }
}

export function signTelnyx(rawBody: string, timestamp: string, privateKey: KeyObject): string {
  return sign(null, Buffer.from(`${timestamp}|${rawBody}`), privateKey).toString('base64');
}

/** Signature Twilio : HMAC-SHA1 de l'URL + paramètres triés. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', authToken).update(data).digest('base64');
}

export function verifyTwilioSignature(opts: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | undefined;
}): boolean {
  if (!opts.signature) return false;
  const expected = twilioSignature(opts.authToken, opts.url, opts.params);
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
