import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * SIGMAP Côte d'Ivoire — https://www.marchespublics.ci/
 *
 * Scraping HTML classique avec cheerio. Structure du site :
 *  - Liste des AO publiés accessible via /AvisPublication
 *  - Chaque AO a une ligne avec : référence, objet, date publication, date limite
 *
 * ⚠️ Fragile : la structure HTML peut changer sans préavis côté SIGMAP.
 * À surveiller via les ScraperRun en échec.
 */
@Injectable()
export class SigmapScraper extends AbstractScraper {
  readonly sourceCode = 'SIGMAP_CI';
  readonly sourceLabel = 'SIGMAP Côte d\'Ivoire';
  readonly countries = ['CI'];
  readonly baseUrl = 'https://www.marchespublics.ci';
  readonly enabled = false;
  readonly intervalMinutes = 120;

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    try {
      const listUrl = `${this.baseUrl}/AvisPublication`;
      const res = await fetch(listUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TenderPro/1.0)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        errors.push(`HTTP ${res.status} on ${listUrl}`);
        return { items: [], errors };
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // SIGMAP affiche les avis dans des cartes/tableaux. On tente plusieurs sélecteurs
      // courants et on prend le premier qui donne des résultats.
      const selectors = [
        'table.table tbody tr',
        '.avis-list .avis-item',
        '[data-avis-id]',
        'div.card-avis',
      ];

      let rows: any = null;
      for (const sel of selectors) {
        rows = $(sel);
        if (rows.length > 0) break;
      }

      if (rows.length === 0) {
        errors.push(
          'Aucune ligne trouvée — la structure HTML SIGMAP a probablement changé. Inspectez manuellement ' + listUrl,
        );
        return { items, errors };
      }

      rows.each((_i: number, el: any) => {
        const $el = $(el);
        const text = $el.text();

        // Extraction best-effort : référence (souvent en début), objet, dates
        // SIGMAP utilise généralement des formats du type "N° ABC/123/2026"
        const refMatch = text.match(/[A-Z]{2,}\s*[-\/][\w\/\.\-]+/);
        const externalRef = refMatch ? refMatch[0].trim() : $el.attr('data-avis-id') || `sigmap-${Date.now()}-${_i}`;

        // Lien de détail
        const link = $el.find('a[href]').first().attr('href');
        const sourceUrl = link
          ? link.startsWith('http') ? link : `${this.baseUrl}${link.startsWith('/') ? '' : '/'}${link}`
          : undefined;

        // Titre : prendre le plus long texte significatif dans la ligne
        const candidates = $el
          .find('td, .titre, .objet, h3, h4, p')
          .map((_j, c) => $(c).text().trim())
          .get()
          .filter((t) => t.length > 20);
        const title = candidates.sort((a, b) => b.length - a.length)[0] ?? text.trim().slice(0, 200);

        // Dates (format jj/mm/aaaa souvent)
        const dateMatches = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g) ?? [];
        const parsedDates = dateMatches
          .map((d) => this.parseFrDate(d))
          .filter((d): d is Date => !!d);
        const publishedAt = parsedDates[0];
        const submissionDeadline = parsedDates[parsedDates.length - 1] !== publishedAt
          ? parsedDates[parsedDates.length - 1]
          : undefined;

        items.push({
          externalRef,
          title: this.cleanText(title) ?? '(Sans titre)',
          country: 'CI',
          publishedAt,
          submissionDeadline,
          sourceUrl,
          documentUrls: [],
          isEoi: /manifestation|intérêt|AMI\b/i.test(title),
          rawData: { text: text.slice(0, 500) },
        });
      });
    } catch (err: any) {
      errors.push(`Scrape error: ${err.message}`);
    }

    return { items: this.filterByValidDeadline(items), errors };
  }

  /** Parse une date au format français jj/mm/aaaa ou jj-mm-aaaa */
  private parseFrDate(s: string): Date | undefined {
    const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!m) return undefined;
    let [, dd, mm, yyyy] = m;
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? undefined : d;
  }
}
