import { Injectable } from '@nestjs/common';
import { AbstractScraper, ScrapedItem, ScraperResult } from '../abstract-scraper';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { J360AuthService } from '../../j360/j360-auth.service';

/**
 * Scraper J360 (app.j360.info).
 * Paramétré par cabinet via J360Config en base.
 * Agrège ARMP Cameroun, ARMP Guinée, AfDB, UNGM, ASECNA, JOFFRES BF, etc.
 */
@Injectable()
export class J360Scraper extends AbstractScraper {
  readonly sourceCode = 'J360';
  readonly sourceLabel = 'J360 (agrégateur)';
  readonly countries = ['MULTI'];
  readonly baseUrl = 'https://app.j360.info';
  readonly enabled = true;
  readonly intervalMinutes = 60;

  private readonly apiUrl = 'https://app.j360.info/api/announces';

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: J360AuthService,
  ) {
    super();
  }

  async scrape(): Promise<ScraperResult> {
    const errors: string[] = [];
    const items: ScrapedItem[] = [];

    const configs = await this.prisma.j360Config.findMany({
      where: { isActive: true },
    });

    if (configs.length === 0) {
      return {
        items,
        errors: ['Aucun cabinet n\'a activé J360. Configure-le dans /sources pour démarrer.'],
      };
    }

    const seenIds = new Set<number>();

    for (const config of configs) {
      if (
        config.countries.length === 0
        || config.tradeIds.length === 0
        || config.announceTypes.length === 0
      ) {
        continue;
      }

      try {
        const configItems = await this.scrapeForConfig(config, seenIds);
        items.push(...configItems);
      } catch (err: any) {
        errors.push(`Config cabinet ${config.cabinetId} : ${err.message}`);
        if (err.message.includes('401') || err.message.includes('403')) {
          await this.auth.invalidate();
        }
      }
    }

    return { items, errors };
  }

  private async scrapeForConfig(
    config: {
      countries: string[];
      tradeIds: number[];
      announceTypes: string[];
      maxPagesPerRun: number;
    },
    seenIds: Set<number>,
  ): Promise<ScrapedItem[]> {
    const items: ScrapedItem[] = [];
    const maxPages = Math.min(config.maxPagesPerRun, 10);

    for (let page = 1; page <= maxPages; page++) {
      const url = this.buildUrl(config, page);
      const pageItems = await this.fetchPage(url);
      if (pageItems.length === 0) break;

      for (const announce of pageItems) {
        if (seenIds.has(announce.id)) continue;
        seenIds.add(announce.id);
        items.push(this.toScrapedItem(announce));
      }

      if (pageItems.length < 20) break;
    }

    return items;
  }

  private buildUrl(
    config: { countries: string[]; tradeIds: number[]; announceTypes: string[] },
    page: number,
  ): string {
    const params = new URLSearchParams();
    for (const c of config.countries) params.append('countries', c);
    for (const t of config.tradeIds) params.append('trades', String(t));
    params.append('type', config.announceTypes.join(','));
    params.append('op', 'AND');
    params.append('order_by', '-created');
    params.append('search_all_fields', 'true');
    params.append('page', String(page));
    return `${this.apiUrl}?${params.toString()}`;
  }

  private async fetchPage(url: string): Promise<J360Announce[]> {
    const doRequest = async (cookies: string) => {
      return fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': cookies,
          'Referer': 'https://app.j360.info/',
        },
        signal: AbortSignal.timeout(25000),
      });
    };

    let cookies = await this.auth.getCookieHeader();
    let res = await doRequest(cookies);

    if (res.status === 401 || res.status === 403) {
      this.logger.warn(`J360 a renvoyé ${res.status} — relogin automatique`);
      cookies = await this.auth.getCookieHeader(true);
      res = await doRequest(cookies);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} sur ${url}`);
    }

    const json = (await res.json()) as { results?: J360Announce[] };
    return json.results ?? [];
  }

  private toScrapedItem(a: J360Announce): ScrapedItem {
    const countryCode = a.buyer_place?.country_code;
    const mappedCountry = this.mapToPrismaCountry(countryCode);

    const submissionDeadline = a.limit_date ? new Date(a.limit_date) : undefined;
    const publishedAt = a.date_publication ? new Date(a.date_publication) : undefined;

    const specialCriterion = a.special_criterion ?? [];
    const titleLower = a.title?.toLowerCase() ?? '';
    const isEoi =
      specialCriterion.includes('AO_AMI')
      || /manifestation\s+d['']?int[ée]r[êe]t|\bami\b|\beoi\b/i.test(titleLower);

    // Helper pour tronquer en toute sécurité
    const truncate = (s: string | undefined, max: number): string | undefined => {
      if (!s) return undefined;
      return s.length > max ? s.slice(0, max - 3) + '...' : s;
    };

    return {
      externalRef: `J360-${a.id}`.slice(0, 300),
      title: (a.title ?? '').slice(0, 2000), // TEXT mais on limite à 2000 pour éviter les abus
      description: a.buyer ? `Acheteur : ${a.buyer}`.slice(0, 2000) : undefined,
      clientName: truncate(a.buyer, 500),
      country: mappedCountry?.slice(0, 50),
      publishedAt,
      submissionDeadline,
      sourceUrl: `https://app.j360.info/app.j360.info/#/announce/${a.id}`,
      documentUrls: [],
      isEoi,
      budgetIndicative: a.amount?.montant ?? undefined,
      currency: a.amount?.devise ? a.amount.devise.slice(0, 3) : undefined,
      rawData: { source: a.source_name, domain: a.source_domain },
    };
  }

  private mapToPrismaCountry(code?: string): string | undefined {
    if (!code) return undefined;
    const supported = ['CI', 'SN', 'BF', 'ML', 'TG', 'BJ', 'NE', 'GW', 'CM', 'GA', 'CD', 'MG'];
    return supported.includes(code) ? code : 'OTHER';
  }
}

interface J360Announce {
  id: number;
  title: string;
  buyer?: string;
  announce_type: 'MC' | 'MA' | 'RM' | 'AB' | 'AP';
  limit_date: string | null;
  date_publication: string | null;
  buyer_place?: {
    country_code?: string;
    country_name?: string;
  };
  special_criterion?: string[];
  amount?: {
    devise: string;
    montant: number;
    type: string;
  } | null;
  source_name?: string;
  source_domain?: string;
}
