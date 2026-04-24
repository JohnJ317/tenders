import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * Educarrière CI — https://services.educarriere.ci/appelsdoffres/
 *
 * Structure HTML : chaque AO est un <article> avec :
 *  - <h3> contenant le titre
 *  - Une date au format jj/mm/aaaa
 *  - Un lien /appelsdoffres/read.php?p=NUMERO-slug-long
 *
 * Remplace SIGMAP dans la couverture Côte d'Ivoire.
 */
@Injectable()
export class EducarriereScraper extends AbstractScraper {
  readonly sourceCode = 'EDUCARRIERE_CI';
  readonly sourceLabel = 'Educarrière Côte d\'Ivoire';
  readonly countries = ['CI'];
  readonly baseUrl = 'https://services.educarriere.ci/appelsdoffres/';
  readonly enabled = true;
  readonly intervalMinutes = 120;

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

      // Le site retourne du HTML en ISO-8859-1 → décoder correctement
      const buffer = await res.arrayBuffer();
      const decoder = new TextDecoder('iso-8859-1');
      const html = decoder.decode(buffer);

      const $ = cheerio.load(html);

      // Chaque AO est un <article> contenant un h3 et une date
      // On cible tous les blocs qui ont un lien vers read.php?p=...
      const links = $('a[href*="read.php?p="]');

      // Grouper par ancêtre pour ne pas dupliquer (chaque article a image + titre + lien consulter)
      const seen = new Set<string>();

      links.each((_i: number, el: any) => {
        const $link = $(el);
        const href = $link.attr('href') || '';

        // Extraire l'ID et le slug de l'URL : read.php?p=1512-renforcement-...
        const match = href.match(/read\.php\?p=(\d+)-(.+)$/);
        if (!match) return;
        const [, idStr, slug] = match;
        if (seen.has(idStr)) return;
        seen.add(idStr);

        // Remonter à l'article parent (ou au plus proche container)
        const $article = $link.closest('article').length > 0
          ? $link.closest('article')
          : $link.parent();

        // Titre : le h3 dans l'article ou le lien lui-même
        let title = this.cleanText($article.find('h3').first().text());
        if (!title) {
          title = this.cleanText($link.text());
        }
        if (!title) return;

        // Date de publication : format jj/mm/aaaa dans le texte
        const articleText = $article.text();
        const dateMatch = articleText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        let publishedAt: Date | undefined;
        if (dateMatch) {
          publishedAt = new Date(
            Number(dateMatch[3]),
            Number(dateMatch[2]) - 1,
            Number(dateMatch[1]),
          );
          if (isNaN(publishedAt.getTime())) publishedAt = undefined;
        }

        const sourceUrl = href.startsWith('http')
          ? href
          : `https://services.educarriere.ci${href.startsWith('/') ? '' : '/appelsdoffres/'}${href}`;

        // Détection AMI (manifestation d'intérêt)
        const titleLower = title.toLowerCase();
        const isEoi = /manifestation\s+d['']?int[ée]r[êe]t|\bami\b/i.test(titleLower);

        items.push({
          externalRef: `EDUCARRIERE-${idStr}`,
          title,
          country: 'CI',
          publishedAt,
          sourceUrl,
          documentUrls: [],
          isEoi,
        });
      });

      if (items.length === 0) {
        errors.push(
          'Aucun AO extrait — la structure HTML Educarrière a peut-être changé. Vérifier manuellement.',
        );
      }
    } catch (err: any) {
      errors.push(`Erreur Educarrière : ${err.message}`);
    }

    return { items, errors };
  }
}
