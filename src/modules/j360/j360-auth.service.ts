import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Service d'authentification J360.
 *
 * J360 utilise un login form classique (POST /login/) qui pose 5 cookies :
 *   - JWT-access (expire 2082)
 *   - JWT-refresh (expire 2086)
 *   - userid
 *   - j360csrftoken
 *   - sessionid
 *
 * On stocke ces cookies en cache Redis avec TTL de 7 jours. Si une requête
 * API renvoie 401/403, on force un re-login.
 */
@Injectable()
export class J360AuthService {
  private readonly logger = new Logger(J360AuthService.name);
  private readonly loginUrl = 'https://app.j360.info/login/';
  private readonly redis: Redis;

  /** Clé Redis qui stocke le cookie string sérialisé */
  private readonly cookieKey = 'j360:cookies';
  /** TTL cookies : 7 jours (on relogue avant expiration réelle pour éviter les surprises) */
  private readonly cookieTtlSeconds = 7 * 24 * 3600;

  constructor() {
    // Priorité à REDIS_URL (format Railway/Heroku : redis[s]://[user:pass@]host:port[/db]).
    // Fallback sur REDIS_HOST/PORT/PASSWORD pour le dev local docker-compose.
    const url = process.env.REDIS_URL;
    this.redis = url
      ? new Redis(url, { maxRetriesPerRequest: 3 })
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: 3,
        });
  }

  /**
   * Retourne une chaîne "Cookie" utilisable dans les headers d'une requête.
   * Si le cache est vide ou expiré, fait un nouveau login.
   */
  async getCookieHeader(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.redis.get(this.cookieKey);
      if (cached) return cached;
    }

    return this.login();
  }

  /** Force un nouveau login auprès de J360 et met en cache les cookies. */
  async login(): Promise<string> {
    const email = process.env.J360_EMAIL;
    const password = process.env.J360_PASSWORD;

    if (!email || !password) {
      throw new Error(
        'J360_EMAIL et J360_PASSWORD doivent être définis dans .env pour utiliser le scraper J360',
      );
    }

    this.logger.log('Login J360 en cours...');

    // Étape 1 : GET /login/ pour récupérer le token CSRF (Django classique)
    const csrfRes = await fetch(this.loginUrl, {
      method: 'GET',
      headers: { 'User-Agent': this.userAgent() },
      signal: AbortSignal.timeout(15000),
    });

    if (!csrfRes.ok) {
      throw new Error(`GET /login/ a renvoyé ${csrfRes.status}`);
    }

    const setCookieGet = this.parseSetCookieHeaders(csrfRes);
    const csrfToken = setCookieGet.j360csrftoken;
    const csrfCookieString = this.cookieStringFrom(setCookieGet);

    if (!csrfToken) {
      throw new Error('Impossible de récupérer j360csrftoken depuis /login/ (GET)');
    }

    // Étape 2 : POST /login/ avec les credentials + CSRF token
    const formBody = new URLSearchParams({
      csrfmiddlewaretoken: csrfToken,
      username: email,
      password,
      remember_me: 'on',
      next: '/',
    });

    const loginRes = await fetch(this.loginUrl, {
      method: 'POST',
      headers: {
        'User-Agent': this.userAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': this.loginUrl,
        'Cookie': csrfCookieString,
        'Origin': 'https://app.j360.info',
      },
      body: formBody.toString(),
      redirect: 'manual', // Important : on veut capturer le 302 Set-Cookie sans suivre
      signal: AbortSignal.timeout(15000),
    });

    // Succès = 302 Found avec redirection vers /
    if (loginRes.status !== 302 && loginRes.status !== 200) {
      throw new Error(
        `Login J360 a échoué : status ${loginRes.status}. Vérifie J360_EMAIL / J360_PASSWORD.`,
      );
    }

    const setCookiePost = this.parseSetCookieHeaders(loginRes);

    // Debug : log ce que J360 a renvoyé
    this.logger.debug(
      `J360 login response: status=${loginRes.status}, `
      + `Location=${loginRes.headers.get('location')}, `
      + `cookies received=${Object.keys(setCookiePost).join(',') || 'AUCUN'}`,
    );
    const rawCookies = (loginRes.headers as any).getSetCookie?.() ?? [];
    this.logger.debug(`Raw Set-Cookie headers: ${JSON.stringify(rawCookies)}`);

    // Vérifier qu'on a bien les JWT + sessionid
    if (!setCookiePost['JWT-access'] || !setCookiePost.sessionid) {
      throw new Error(
        'Login J360 retourne 302 mais les cookies JWT-access/sessionid sont absents. '
        + 'Structure de login a peut-être changé.',
      );
    }

    // On assemble tous les cookies (GET + POST) pour les requêtes futures
    const merged = { ...setCookieGet, ...setCookiePost };
    const cookieString = this.cookieStringFrom(merged);

    await this.redis.set(this.cookieKey, cookieString, 'EX', this.cookieTtlSeconds);

    this.logger.log(`Login J360 réussi — ${Object.keys(merged).length} cookies mis en cache`);
    return cookieString;
  }

  /**
   * Parse les headers Set-Cookie multiples d'une réponse fetch.
   * fetch() Node stocke les Set-Cookie multiples dans une structure un peu
   * spéciale ; on utilise `getSetCookie()` (Node 20+) pour tout récupérer.
   */
  private parseSetCookieHeaders(res: Response): Record<string, string> {
    const result: Record<string, string> = {};

    // Node 20+ : getSetCookie() retourne un string[] avec tous les Set-Cookie
    let rawCookies: string[] = [];
    if (typeof (res.headers as any).getSetCookie === 'function') {
      rawCookies = (res.headers as any).getSetCookie();
    } else {
      // Fallback ultra-basique (ne devrait pas arriver sur Node 20+)
      const raw = res.headers.get('set-cookie');
      if (raw) rawCookies = [raw];
    }

    for (const line of rawCookies) {
      // Ligne type : "JWT-access=eyJhbGc...; Domain=.j360.info; expires=...; Path=/"
      const firstEq = line.indexOf('=');
      const semi = line.indexOf(';');
      if (firstEq === -1) continue;
      const name = line.slice(0, firstEq).trim();
      const value = semi > -1 ? line.slice(firstEq + 1, semi) : line.slice(firstEq + 1);
      if (name) result[name] = value;
    }

    return result;
  }

  /** Transforme un dict {name: value, ...} en "name1=value1; name2=value2; ..." */
  private cookieStringFrom(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private userAgent(): string {
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /** Invalide le cache cookies (utile si on détecte un 401/403 dans les requêtes API). */
  async invalidate(): Promise<void> {
    await this.redis.del(this.cookieKey);
  }
}
