import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Vérifie la signature HMAC SHA-256 envoyée par Wave dans le header `Wave-Signature`.
 *
 * Conforme à la doc officielle : https://docs.wave.com/webhook
 *
 * Format attendu du header :
 *   Wave-Signature: t=1639081943,v1=abc123...,v1=def456...
 *
 * Wave peut envoyer plusieurs signatures (v1=) durant une rotation de secret.
 * On accepte le webhook si AU MOINS UNE signature match.
 *
 * Calcul (selon doc Wave officielle) :
 *   payload      = `${timestamp}${rawBody}`  (concaténation directe, PAS de séparateur)
 *   expectedSig  = HMAC_SHA256(WAVE_WEBHOOK_SECRET, payload)
 *
 * Anti-replay : timestamp doit être < 5 min dans le passé (300s).
 *
 * Mode dev : si WAVE_WEBHOOK_SECRET n'est pas défini, on log un warning
 *            et on laisse passer. ⚠️ NE JAMAIS DÉPLOYER EN PROD SANS LE SECRET.
 */
@Injectable()
export class WaveSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WaveSignatureGuard.name);
  private readonly TOLERANCE_SECONDS = 300; // 5 minutes anti-replay (recommandation Wave)

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const secret = process.env.WAVE_WEBHOOK_SECRET;

    // Mode dev : pas de secret configuré → on laisse passer
    if (!secret) {
      this.logger.warn(
        '⚠️  WAVE_WEBHOOK_SECRET non défini — webhook accepté SANS vérification HMAC. ' +
        'À configurer obligatoirement en production (format wave_sn_WHS_xxx...).',
      );
      return true;
    }

    const signatureHeader = req.headers['wave-signature'] as string | undefined;
    if (!signatureHeader) {
      this.logger.warn('Webhook Wave sans header Wave-Signature → rejeté');
      throw new UnauthorizedException('missing-signature');
    }

    // Parser le header — peut contenir plusieurs v1= durant rotation
    // Format : "t=1234,v1=abc,v1=def"
    const parts = signatureHeader.split(',').map((s) => s.trim());

    let timestamp: string | undefined;
    const signatures: string[] = [];

    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const key = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      if (key === 't') timestamp = val;
      else if (key === 'v1') signatures.push(val);
    }

    if (!timestamp || signatures.length === 0) {
      this.logger.warn(`Wave-Signature mal formé : ${signatureHeader}`);
      throw new UnauthorizedException('invalid-signature-format');
    }

    // Anti-replay : timestamp pas trop ancien
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts)) {
      this.logger.warn(`Timestamp non numérique : ${timestamp}`);
      throw new UnauthorizedException('invalid-signature-timestamp');
    }
    if (Math.abs(now - ts) > this.TOLERANCE_SECONDS) {
      this.logger.warn(`Wave-Signature timestamp expiré (now=${now}, t=${ts})`);
      throw new UnauthorizedException('expired-signature-timestamp');
    }

    // Récupération du raw body (capturé par main.ts { rawBody: true })
    const rawBody: Buffer | string | undefined = (req as any).rawBody;
    if (!rawBody) {
      this.logger.error(
        'Raw body non disponible. Vérifie que NestFactory.create() est appelé avec { rawBody: true }',
      );
      throw new UnauthorizedException('Cannot verify signature without raw body');
    }

    const rawBodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;

    // ⚠️ Selon doc Wave : payload = timestamp + body (PAS de séparateur)
    const payload = `${timestamp}${rawBodyStr}`;

    const computedSig = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // Vérifier si AU MOINS UNE signature reçue match (rotation de secret)
    const computedBuf = Buffer.from(computedSig, 'hex');
    let matched = false;
    for (const sig of signatures) {
      const sigBuf = Buffer.from(sig, 'hex');
      if (sigBuf.length === computedBuf.length && crypto.timingSafeEqual(sigBuf, computedBuf)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      this.logger.warn(`Wave-Signature invalide pour timestamp ${timestamp}`);
      throw new UnauthorizedException('invalid-signature');
    }

    this.logger.log(`✅ Wave webhook signature valid (t=${timestamp})`);
    return true;
  }
}
