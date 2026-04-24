import { Injectable } from '@nestjs/common';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * Banque Mondiale — utilise l'API publique officielle
 * https://search.worldbank.org/api/v2/procnotices
 *
 * Retourne les avis de marché (procurement notices) en JSON propre.
 * Volume : ~200 nouveaux avis/semaine tous pays confondus.
 */
@Injectable()
export class WorldBankScraper extends AbstractScraper {
  readonly sourceCode = 'WORLD_BANK';
  readonly sourceLabel = 'Banque Mondiale';
  readonly countries = ['INTERNATIONAL'];
  readonly baseUrl = 'https://projects.worldbank.org/en/projects-operations/procurement';
  readonly enabled = true;
  readonly intervalMinutes = 180; // 3h

  /**
   * Pays africains — mapping nom complet (tel qu'utilisé par la BM) → code ISO2.
   * L'API renvoie le nom en anglais dans project_ctry_name.
   */
  private readonly COUNTRY_MAP: Record<string, string> = {
    "Cote d'Ivoire": 'CI',
    "Côte d'Ivoire": 'CI',
    'Senegal': 'SN',
    'Burkina Faso': 'BF',
    'Mali': 'ML',
    'Togo': 'TG',
    'Benin': 'BJ',
    'Niger': 'NE',
    'Guinea': 'GN',
    'Guinea-Bissau': 'GW',
    'Cameroon': 'CM',
    'Gabon': 'GA',
    'Congo, Republic of': 'CG',
    'Congo, Democratic Republic of': 'CD',
    'Central African Republic': 'CF',
    'Chad': 'TD',
    'Madagascar': 'MG',
    'Mauritius': 'MU',
    'Comoros': 'KM',
    'Djibouti': 'DJ',
    'Morocco': 'MA',
    'Tunisia': 'TN',
    'Algeria': 'DZ',
    'Mauritania': 'MR',
    'Burundi': 'BI',
    'Rwanda': 'RW',
    'Cabo Verde': 'CV',
    'Equatorial Guinea': 'GQ',
  };

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    try {
      // API publique BM — on trie par date de publication décroissante
      const url =
        'https://search.worldbank.org/api/v2/procnotices?format=json&rows=500&os=0&srt=noticedate&order=desc';

      const res = await fetch(url, {
        headers: { 'User-Agent': 'TenderPro/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        errors.push(`HTTP ${res.status} on ${url}`);
        return { items: [], errors };
      }
      const data = await res.json();

      const notices = data?.procnotices ?? {};
      // L'API retourne soit un objet indexé, soit un tableau
      const list = Array.isArray(notices) ? notices : Object.values(notices);

      for (const n of list as any[]) {
        // 1. Filtre pays — uniquement Afrique
        const countryName: string | undefined = n.project_ctry_name;
        if (!countryName) continue;
        const iso2 = this.COUNTRY_MAP[countryName.trim()];
        if (!iso2) continue; // pays non africain → on ignore

        // 2. Filtre : on garde uniquement les AO et AMI (pas les contract awards)
        const noticeType: string = (n.notice_type ?? '').toLowerCase();
        if (noticeType.includes('contract award')) continue;

        // 3. Filtre deadline — la clé correcte est submission_deadline_date
        const deadline = this.parseDate(
          n.submission_deadline_date || n.submission_date,
        );
        if (deadline && deadline.getTime() < Date.now()) continue;

        const noticeId = n.id;
        const sourceUrl = noticeId
          ? `https://projects.worldbank.org/en/projects-operations/procurement-detail/${noticeId}`
          : undefined;

        // Titre : priorité au bid_description (plus spécifique) sinon project_name
        const title =
          this.cleanText(n.bid_description) ??
          this.cleanText(n.project_name) ??
          '(Sans titre)';

        // Description : on prend notice_text mais on nettoie le HTML
        const rawDescription = this.cleanText(n.notice_text);
        const description = rawDescription
          ? this.stripHtml(rawDescription).slice(0, 2000)
          : undefined;

        items.push({
          externalRef: String(noticeId),
          title,
          description,
          clientName: this.cleanText(n.contact_organization || n.project_name),
          sector: this.cleanText(n.major_sector || n.procurement_group_name),
          country: iso2,
          publishedAt: this.parseDate(n.noticedate),
          submissionDeadline: deadline,
          currency: undefined, // pas communiqué par la BM dans le notice
          sourceUrl,
          documentUrls: [],
          isEoi:
            /expression of interest/i.test(noticeType) ||
            /expression of interest/i.test(title),
          rawData: n,
        });
      }
    } catch (err: any) {
      errors.push(`Fetch error: ${err.message}`);
    }

    return { items, errors };
  }

  private stripHtml(s: string): string {
    return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
