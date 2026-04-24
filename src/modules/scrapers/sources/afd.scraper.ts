import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * AFD — Agence Française de Développement
 * Page des appels à projets : https://www.afd.fr/fr/appels-a-projets/liste
 *
 * L'ancien RSS /fr/rss/appels-offres a été supprimé. Nouvelle source : scraping HTML.
 * Format : liste d'articles avec titre h3 cliquable, thématique, statut (En cours / Prochainement / Clôturé),
 * dates de publication et clôture, pays/région de couverture.
 */
@Injectable()
export class AfdScraper extends AbstractScraper {
  readonly sourceCode = 'AFD';
  readonly sourceLabel = 'AFD France';
  readonly countries = ['INTERNATIONAL'];
  readonly baseUrl = 'https://www.afd.fr';
  readonly enabled = true;
  readonly intervalMinutes = 240;

  /** Pays africains francophones : nom français → code ISO2 */
  private readonly COUNTRY_NAMES: Record<string, string> = {
    "côte d'ivoire": 'CI',
    "cote d'ivoire": 'CI',
    "sénégal": 'SN',
    "senegal": 'SN',
    "burkina faso": 'BF',
    "mali": 'ML',
    "togo": 'TG',
    "bénin": 'BJ',
    "benin": 'BJ',
    "niger": 'NE',
    "guinée": 'GN',
    "guinee": 'GN',
    "cameroun": 'CM',
    "gabon": 'GA',
    "congo": 'CG',
    "république démocratique du congo": 'CD',
    "republique democratique du congo": 'CD',
    "madagascar": 'MG',
    "maroc": 'MA',
    "tunisie": 'TN',
    "burundi": 'BI',
    "rwanda": 'RW',
    "mauritanie": 'MR',
    "tchad": 'TD',
    "djibouti": 'DJ',
    "comores": 'KM',
    "maurice": 'MU',
  };

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    try {
      const listUrl = `${this.baseUrl}/fr/appels-a-projets/liste?status%5Bongoing%5D=ongoing&status%5Bsoon%5D=soon`;

      const res = await fetch(listUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        errors.push(`HTTP ${res.status} sur ${listUrl}`);
        return { items, errors };
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Chaque AO est structuré en h3 suivis d'infos (dates, pays). On itère sur les h3
      // contenant un lien vers /fr/appels-a-projets/...
      const headings = $('h3 a[href*="/fr/appels-a-projets/"], h2 a[href*="/fr/appels-a-projets/"]');

      const seen = new Set<string>();

      headings.each((_i: number, el: any) => {
        const $link = $(el);
        const href = $link.attr('href') || '';

        // Ignorer le lien de la page liste elle-même
        if (!href.match(/\/fr\/appels-a-projets\/[a-z][\w-]{10,}/i)) return;
        if (seen.has(href)) return;
        seen.add(href);

        const title = this.cleanText($link.text());
        if (!title) return;

        // Remonter au conteneur parent pour récupérer les métadonnées (dates, pays)
        // La structure est imbriquée dans un article/div parent
        const $container = $link.closest('article, div');
        const containerText = $container.text();

        // Chercher le statut (En cours / Prochainement / Clôturé)
        const isClosed = /Clôturé|Cloture/i.test(containerText);
        if (isClosed) return; // on ignore les AO clôturés

        // Parser les dates au format "DD mois YYYY - DD mois YYYY"
        const { publishedAt, submissionDeadline } = this.parseDateRange(containerText);

        // Ignorer si la deadline est déjà passée
        if (submissionDeadline && submissionDeadline.getTime() < Date.now()) return;

        // Détection du pays
        const country = this.detectCountry(containerText);

        const sourceUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

        items.push({
          externalRef: `AFD-${href.split('/').pop()}`,
          title,
          country,
          publishedAt,
          submissionDeadline,
          sourceUrl,
          documentUrls: [],
          isEoi: /manifestation\s+d['']?int[ée]r[êe]t|\bami\b/i.test(title),
        });
      });

      if (items.length === 0) {
        errors.push(
          'Aucun appel à projets AFD en cours ou à venir trouvé — cela peut être normal selon la période, ou la structure HTML AFD a changé',
        );
      }
    } catch (err: any) {
      errors.push(`Erreur AFD : ${err.message}`);
    }

    return { items, errors };
  }

  private parseDateRange(text: string): { publishedAt?: Date; submissionDeadline?: Date } {
    // Format : "17 décembre 2024 - 24 janvier 2025" ou similaire
    const MONTHS: Record<string, number> = {
      'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
      'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
      'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12,
    };

    const pattern = /(\d{1,2})\s+(\w+)\s+(\d{4})/g;
    const matches = Array.from(text.matchAll(pattern));
    const dates: Date[] = [];
    for (const m of matches) {
      const month = MONTHS[m[2].toLowerCase()];
      if (!month) continue;
      const d = new Date(Number(m[3]), month - 1, Number(m[1]));
      if (!isNaN(d.getTime())) dates.push(d);
    }

    if (dates.length === 0) return {};
    if (dates.length === 1) return { submissionDeadline: dates[0] };
    // Si plusieurs dates, la première est publication, la dernière est deadline
    return {
      publishedAt: dates[0],
      submissionDeadline: dates[dates.length - 1],
    };
  }

  private detectCountry(text: string): string | undefined {
    const lower = text.toLowerCase();
    for (const [name, code] of Object.entries(this.COUNTRY_NAMES)) {
      if (lower.includes(name)) return code;
    }
    return undefined;
  }
}
