import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * BCEAO — Banque Centrale des États de l'Afrique de l'Ouest
 * https://www.bceao.int/fr/appels-offres/appels-offres-marches-publics-achats
 *
 * Couvre les 8 pays UEMOA : CI, SN, BF, ML, TG, BJ, NE, GW.
 * Structure : chaque AO est un lien avec "Publié le [date]" et "Date limite le [date]".
 */
@Injectable()
export class BceaoScraper extends AbstractScraper {
  readonly sourceCode = 'BCEAO';
  readonly sourceLabel = 'BCEAO (UEMOA)';
  readonly countries = ['CI', 'SN', 'BF', 'ML', 'TG', 'BJ', 'NE', 'GW'];
  readonly baseUrl = 'https://www.bceao.int/fr/appels-offres/appels-offres-marches-publics-achats';
  readonly enabled = true;
  readonly intervalMinutes = 180;

  /** Mapping mois français → numéro */
  private readonly MONTHS_FR: Record<string, number> = {
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
    'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
    'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12,
  };

  /** Mapping ville/agence BCEAO → code pays */
  private readonly CITY_TO_COUNTRY: Array<[RegExp, string]> = [
    [/abidjan/i, 'CI'],
    [/\bdakar\b/i, 'SN'],
    [/\bouagadougou\b|\bzinder\b/i, 'BF'],
    [/\bbamako\b/i, 'ML'],
    [/\blom[ée]\b/i, 'TG'],
    [/\bcotonou\b/i, 'BJ'],
    [/\bniamey\b|\bmaradi\b/i, 'NE'],
    [/\bbissau\b/i, 'GW'],
    [/\bziguinchor\b/i, 'SN'],
    [/\btenkodogo\b/i, 'BF'],
    [/côte d['\u2019]ivoire|cote d['\u2019]ivoire/i, 'CI'],
    [/s[ée]n[ée]gal/i, 'SN'],
    [/burkina/i, 'BF'],
    [/\bmali\b/i, 'ML'],
    [/\btogo\b/i, 'TG'],
    [/b[ée]nin/i, 'BJ'],
    [/\bniger\b(?!ia)/i, 'NE'],
    [/guin[ée]e[- ]bissau/i, 'GW'],
  ];

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    try {
      const res = await fetch(this.baseUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        errors.push(`HTTP ${res.status} sur ${this.baseUrl}`);
        return { items, errors };
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Les AO "En cours" apparaissent après le titre "Appel d'offres En cours"
      // Chaque AO est un lien <a href="/fr/appels-offres/..."> avec le texte contenant
      // "Publié le <date>", optionnellement une référence, puis "Date limite le <date>", puis le titre.
      const links = $('a[href^="/fr/appels-offres/"]');

      const seen = new Set<string>();

      links.each((_i: number, el: any) => {
        const $link = $(el);
        const href = $link.attr('href') || '';

        // Ignorer les liens qui ne sont pas des AO individuels
        if (!href.match(/^\/fr\/appels-offres\/[a-z0-9-]{15,}/i)) return;
        if (seen.has(href)) return;
        seen.add(href);

        const rawText = $link.text();
        const text = rawText.replace(/\s+/g, ' ').trim();
        if (text.length < 20) return;

        // Parser les dates : "Publié le DD mois YYYY" et "Date limite le DD mois YYYY"
        const publishedMatch = text.match(/Publi[ée]\s+le\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i);
        const deadlineMatch = text.match(/Date\s+limite\s+le\s+(\d{1,2})\s+(\w+)\s+(\d{4})/i);

        const publishedAt = publishedMatch
          ? this.parseFrDate(publishedMatch[1], publishedMatch[2], publishedMatch[3])
          : undefined;
        const submissionDeadline = deadlineMatch
          ? this.parseFrDate(deadlineMatch[1], deadlineMatch[2], deadlineMatch[3])
          : undefined;

        // Nettoyer le titre : retirer les dates et références d'en-tête
        let title = text;
        if (publishedMatch) title = title.replace(publishedMatch[0], '');
        if (deadlineMatch) title = title.replace(deadlineMatch[0], '');
        // Retirer les références (format AO/ZXX/..., T00/..., etc.)
        title = title.replace(/^[\s]*[A-Z0-9][\w\/°\.-]+\s+/, '').trim();
        // Si le titre contient toujours une ref en tête, la retirer aussi
        title = title.replace(/^(Note\s*N°?\s*\d+|A00\s+NOTE\s+N°?\s*\d+D?\s+DU\s+[\d\s]+|N°\s*[\w\/\.-]+)\s*/i, '').trim();

        if (title.length < 10) return;

        // Détection pays depuis le texte complet
        const country = this.detectCountry(text);

        const sourceUrl = `https://www.bceao.int${href}`;

        items.push({
          externalRef: `BCEAO-${href.split('/').pop()}`,
          title: title.length > 500 ? title.slice(0, 500) : title,
          country,
          publishedAt,
          submissionDeadline,
          sourceUrl,
          documentUrls: [],
          isEoi: /manifestation\s+d['']?int[ée]r[êe]t|\bami\b/i.test(title),
        });
      });

      if (items.length === 0) {
        errors.push('Aucun AO BCEAO extrait — la structure HTML a peut-être changé');
      }
    } catch (err: any) {
      errors.push(`Erreur BCEAO : ${err.message}`);
    }

    return { items: this.filterByValidDeadline(items), errors };
  }

  private parseFrDate(day: string, monthFr: string, year: string): Date | undefined {
    const month = this.MONTHS_FR[monthFr.toLowerCase()];
    if (!month) return undefined;
    const d = new Date(Number(year), month - 1, Number(day));
    return isNaN(d.getTime()) ? undefined : d;
  }

  private detectCountry(text: string): string | undefined {
    for (const [re, code] of this.CITY_TO_COUNTRY) {
      if (re.test(text)) return code;
    }
    return undefined;
  }
}
