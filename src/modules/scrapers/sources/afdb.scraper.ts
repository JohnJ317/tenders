import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * AfDB — African Development Bank
 * Procurement notices : https://www.afdb.org/en/projects-and-operations/procurement/notices
 *
 * Protection anti-bot détectée (HTTP 403 sur requêtes directes).
 * Stratégie niveau 2 : GET préalable sur la home pour récupérer les cookies
 * de session, puis GET de la page de notices avec tous les headers Chrome.
 * Si 403 persiste → c'est Cloudflare sérieux, à ce moment-là J360 prend le relais.
 */
@Injectable()
export class AfdbScraper extends AbstractScraper {
  readonly sourceCode = 'AFDB';
  readonly sourceLabel = 'AfDB (African Development Bank)';
  readonly countries = ['INTERNATIONAL'];
  readonly baseUrl = 'https://www.afdb.org';
  readonly enabled = false;
  readonly intervalMinutes = 240;

  private readonly userAgent =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    try {
      // Étape 1 : GET de la home pour déclencher les cookies de session
      const warmupRes = await fetch(this.baseUrl, {
        headers: this.browserHeaders(),
        signal: AbortSignal.timeout(20000),
      });

      // On ignore le statut de la warmup, on garde juste les cookies
      const cookies = this.extractCookies(warmupRes);

      // Étape 2 : GET de la page des notices avec cookies + headers Chrome
      const noticesUrl = `${this.baseUrl}/en/projects-and-operations/procurement/notices`;
      const res = await fetch(noticesUrl, {
        headers: {
          ...this.browserHeaders(),
          ...(cookies ? { Cookie: cookies } : {}),
          Referer: this.baseUrl + '/',
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        errors.push(
          `HTTP ${res.status} sur ${noticesUrl} — probablement anti-bot (Cloudflare). J360 couvre cette source.`,
        );
        return { items, errors };
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Parser les lignes de procurement notices.
      // Structure typique Drupal AfDB : <article> ou <div class="views-row">
      const rows = $('.views-row, article, .procurement-notice-item');

      rows.each((_i: number, el: any) => {
        const $el = $(el);
        const $link = $el.find('h2 a, h3 a, a.title').first();
        const title = this.cleanText($link.text());
        if (!title) return;

        const href = $link.attr('href');
        const sourceUrl = href
          ? href.startsWith('http') ? href : `${this.baseUrl}${href}`
          : undefined;

        const fullText = $el.text();
        const country = this.detectCountry(fullText);

        // Dates au format anglais (ex: "15 May 2026") ou ISO
        const dateMatches = fullText.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/g);
        let submissionDeadline: Date | undefined;
        if (dateMatches && dateMatches.length > 0) {
          // La dernière date trouvée est souvent la deadline
          const last = dateMatches[dateMatches.length - 1];
          const d = new Date(last);
          if (!isNaN(d.getTime())) submissionDeadline = d;
        }

        items.push({
          externalRef: sourceUrl ?? `afdb-${_i}-${title.slice(0, 50)}`,
          title,
          country,
          submissionDeadline,
          sourceUrl,
          documentUrls: [],
          isEoi: /expression of interest|\beoi\b/i.test(title),
        });
      });

      if (items.length === 0) {
        errors.push(
          'Aucun item AfDB parsé — la structure HTML a peut-être évolué, ou la page a été servie vide par anti-bot.',
        );
      }
    } catch (err: any) {
      errors.push(`Erreur AfDB : ${err.message}`);
    }

    return { items: this.filterByValidDeadline(items), errors };
  }

  private browserHeaders(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Linux"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };
  }

  /** Extrait les cookies de la réponse sous forme "name1=value1; name2=value2" */
  private extractCookies(res: Response): string | undefined {
    const getSetCookie = (res.headers as any).getSetCookie;
    if (typeof getSetCookie !== 'function') return undefined;
    const rawCookies = getSetCookie.call(res.headers) as string[];
    if (!rawCookies || rawCookies.length === 0) return undefined;

    return rawCookies
      .map((line) => line.split(';')[0].trim())
      .filter((c) => c.length > 0)
      .join('; ');
  }

  private detectCountry(text: string): string | undefined {
    const t = text.toLowerCase();
    const map: Array<[string, RegExp]> = [
      ['CI', /côte d['’]ivoire|cote d['’]ivoire/i],
      ['SN', /senegal|sénégal/i],
      ['BF', /burkina faso/i],
      ['ML', /\bmali\b/i],
      ['TG', /\btogo\b/i],
      ['BJ', /\bbenin\b|bénin/i],
      ['NE', /\bniger\b(?!ia)/i],
      ['CM', /cameroon|cameroun/i],
      ['GA', /\bgabon\b/i],
      ['CD', /democratic republic of the congo|\bdrc\b|rdc/i],
      ['CG', /\bcongo\b/i],
      ['MG', /madagascar/i],
      ['MA', /morocco|maroc/i],
      ['TN', /tunisia|tunisie/i],
      ['DZ', /algeria|algérie/i],
    ];
    for (const [code, re] of map) if (re.test(t)) return code;
    return undefined;
  }
}
