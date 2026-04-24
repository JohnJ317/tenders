import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * UNGM — United Nations Global Marketplace
 * Public notices : https://www.ungm.org/Public/Notice
 *
 * Protection anti-bot détectée (HTTP 403 sur le feed RSS).
 * Stratégie niveau 2 : GET préalable + headers complets + parser HTML
 * au lieu du RSS. Si 403 persiste → J360 couvre.
 */
@Injectable()
export class UngmScraper extends AbstractScraper {
  readonly sourceCode = 'UNGM';
  readonly sourceLabel = 'UNGM (UN Global Marketplace)';
  readonly countries = ['INTERNATIONAL'];
  readonly baseUrl = 'https://www.ungm.org';
  readonly enabled = false;
  readonly intervalMinutes = 240;

  private readonly userAgent =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    try {
      // Étape 1 : GET de la home UNGM pour les cookies
      const warmupRes = await fetch(this.baseUrl, {
        headers: this.browserHeaders(),
        signal: AbortSignal.timeout(20000),
      });
      const cookies = this.extractCookies(warmupRes);

      // Étape 2 : GET de la liste publique des notices (page HTML, pas RSS)
      const noticesUrl = `${this.baseUrl}/Public/Notice`;
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
          `HTTP ${res.status} sur ${noticesUrl} — anti-bot UNGM actif. J360 consolide cette source.`,
        );
        return { items, errors };
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // La page publique UNGM a une table de notices avec class="resultTable"
      // ou des lignes .notice-item (selon version).
      const rows = $('.resultTable tr, .notice-row, .notice-item, tr.item');

      rows.each((_i: number, el: any) => {
        const $el = $(el);
        const text = $el.text();
        if (text.length < 30) return;

        // Titre + lien
        const $link = $el.find('a').first();
        const title = this.cleanText($link.text());
        if (!title) return;

        const href = $link.attr('href');
        const sourceUrl = href
          ? href.startsWith('http') ? href : `${this.baseUrl}${href}`
          : undefined;

        // Pays (souvent dans une colonne ou badge)
        const country = this.detectCountry(text);

        // Deadline : souvent une date ISO ou format "DD-MMM-YYYY"
        const dateMatch = text.match(/\b(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s](\d{4})\b/i)
          || text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        let submissionDeadline: Date | undefined;
        if (dateMatch) {
          const d = new Date(dateMatch[0]);
          if (!isNaN(d.getTime())) submissionDeadline = d;
        }

        items.push({
          externalRef: sourceUrl ?? `ungm-${_i}-${title.slice(0, 50)}`,
          title,
          country,
          submissionDeadline,
          sourceUrl,
          documentUrls: [],
          isEoi: /expression of interest|\beoi\b|manifestation d['’]intér/i.test(title),
        });
      });

      if (items.length === 0) {
        errors.push(
          'Aucun item UNGM parsé — la page a probablement été servie derrière un challenge anti-bot.',
        );
      }
    } catch (err: any) {
      errors.push(`Erreur UNGM : ${err.message}`);
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
      ['CI', /côte d['’]ivoire|cote d['’]ivoire|ivory coast/i],
      ['SN', /senegal|sénégal/i],
      ['BF', /burkina faso/i],
      ['ML', /\bmali\b/i],
      ['TG', /\btogo\b/i],
      ['BJ', /\bbenin\b|bénin/i],
      ['NE', /\bniger\b(?!ia)/i],
      ['CM', /cameroon|cameroun/i],
      ['GA', /\bgabon\b/i],
      ['CD', /dr congo|drc/i],
      ['CG', /\bcongo\b/i],
      ['MG', /madagascar/i],
      ['MA', /morocco|maroc/i],
      ['TN', /tunisia/i],
      ['BI', /burundi/i],
      ['RW', /rwanda/i],
    ];
    for (const [code, re] of map) if (re.test(t)) return code;
    return undefined;
  }
}
