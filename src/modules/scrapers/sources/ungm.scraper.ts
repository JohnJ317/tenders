import { Injectable } from '@nestjs/common';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';

/**
 * UNGM — United Nations Global Marketplace
 * Stratégie niveau 3 : API JSON interne + retry backoff + headers réalistes.
 * Endpoint API utilisé par leur moteur de recherche : POST /Public/Notice/Search
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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    try {
      await this.sleep(1000 + Math.random() * 2000);
      const warmupRes = await fetch(this.baseUrl + '/Public/Notice', {
        headers: this.browserHeaders(),
        signal: AbortSignal.timeout(20000),
      });
      const cookies = this.extractCookies(warmupRes);

      if (!warmupRes.ok) {
        errors.push(`Warmup UNGM retourne ${warmupRes.status} — anti-bot actif. J360 couvre cette source.`);
        return { items, errors };
      }

      await this.sleep(2000 + Math.random() * 2000);

      const apiUrl = `${this.baseUrl}/Public/Notice/Search`;
      const searchBody = {
        PageIndex: 0,
        PageSize: 50,
        Title: '',
        Description: '',
        Reference: '',
        PublishedFrom: '',
        PublishedTo: '',
        DeadlineFrom: new Date().toISOString().split('T')[0],
        DeadlineTo: '',
        Countries: [],
        Agencies: [],
        UNSPSCs: [],
        NoticeTypes: [],
        SortField: 'DatePublished',
        SortAscending: false,
        NoticeTypeCode: '',
        NoticeStatuses: [],
        IsSustainable: false,
        UNGMAreaCode: '',
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          ...this.browserHeaders(),
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': this.baseUrl + '/Public/Notice',
          ...(cookies ? { Cookie: cookies } : {}),
        },
        body: JSON.stringify(searchBody),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        errors.push(`HTTP ${res.status} sur API UNGM — anti-bot renforcé. J360 consolide cette source.`);
        return { items, errors };
      }

      const data: any = await res.json().catch(() => null);
      if (!data || !Array.isArray(data)) {
        errors.push('Réponse UNGM non-JSON ou format inattendu.');
        return { items, errors };
      }

      for (const notice of data) {
        if (!notice?.Title) continue;
        const noticeId = notice.Id || notice.NoticeId;
        const sourceUrl = noticeId ? `${this.baseUrl}/Public/Notice/${noticeId}` : undefined;

        const country = this.detectCountryFromList(notice.BeneficiaryCountries || notice.CountryNames);
        let submissionDeadline: Date | undefined;
        if (notice.Deadline) {
          const d = new Date(notice.Deadline);
          if (!isNaN(d.getTime())) submissionDeadline = d;
        }

        const title = this.cleanText(notice.Title) ?? '';
        if (!title) continue;
        items.push({
          externalRef: sourceUrl ?? `ungm-${noticeId}`,
          title,
          country,
          submissionDeadline,
          sourceUrl,
          documentUrls: [],
          isEoi: /expression of interest|\beoi\b|manifestation d['’]intér/i.test(title),
        });
      }
    } catch (err: any) {
      errors.push(`Erreur UNGM : ${err.message}`);
    }

    return { items: this.filterByValidDeadline(items), errors };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private browserHeaders(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
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

  private detectCountryFromList(countries: any): string | undefined {
    if (!Array.isArray(countries) || countries.length === 0) return undefined;
    const joined = countries.map((c: any) => (typeof c === 'string' ? c : c?.Name || '')).join(' ').toLowerCase();
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
    ];
    for (const [code, re] of map) if (re.test(joined)) return code;
    return undefined;
  }
}
