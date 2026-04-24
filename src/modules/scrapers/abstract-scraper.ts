import { Logger } from '@nestjs/common';

/**
 * Résultat normalisé d'un scraping : représente un AO tel que scrapé,
 * prêt à être persisté en ScrapedTender.
 */
export interface ScrapedItem {
  /** Identifiant unique du côté source (pour dédupliquer) */
  externalRef: string;
  title: string;
  description?: string;
  clientName?: string;
  sector?: string;
  /** Code pays ISO (CI, SN, BF, ML, etc.) ou "INTERNATIONAL" */
  country?: string;
  publishedAt?: Date;
  submissionDeadline?: Date;
  budgetIndicative?: number;
  currency?: string;
  sourceUrl?: string;
  documentUrls?: string[];
  /** True si AMI / manifestation d'intérêt ; false si AO classique */
  isEoi?: boolean;
  /** Données brutes pour debug (facultatif) */
  rawData?: any;
}

export interface ScraperResult {
  items: ScrapedItem[];
  errors: string[];
}

/**
 * Classe de base pour tous les scrapers.
 * Chaque source implémente la méthode scrape() en utilisant fetch, cheerio, ou une API.
 */
export abstract class AbstractScraper {
  protected readonly logger: Logger;

  /** Code court unique (ex: "WORLD_BANK", "SIGMAP_CI"). Doit être stable. */
  abstract readonly sourceCode: string;

  /** Nom affiché dans l'UI */
  abstract readonly sourceLabel: string;

  /** Pays couverts (ISO codes ou ["INTERNATIONAL"] pour bailleurs globaux) */
  abstract readonly countries: string[];

  /** URL de la page source (affichée dans l'admin) */
  abstract readonly baseUrl: string;

  /** True = le scraper est pleinement implémenté et activé par défaut */
  abstract readonly enabled: boolean;

  /** Fréquence de re-scraping en minutes (ex: 60 = toutes les heures) */
  readonly intervalMinutes: number = 120;

  constructor() {
    this.logger = new Logger(`Scraper:${this.constructor.name}`);
  }

  /**
   * Exécute le scraping. Retourne les items trouvés, ou une liste d'erreurs.
   * Ne jette pas d'exception — toujours encapsule les erreurs dans result.errors.
   */
  abstract scrape(): Promise<ScraperResult>;

  /**
   * Helper : filtre pour ne garder que les items dont la deadline est future
   * (ou non renseignée — on ne peut pas savoir).
   */
  protected filterByValidDeadline(items: ScrapedItem[]): ScrapedItem[] {
    const now = Date.now();
    return items.filter(
      (i) => !i.submissionDeadline || i.submissionDeadline.getTime() > now,
    );
  }

  /**
   * Helper : nettoie un texte HTML pour extraire le texte pur.
   */
  protected cleanText(text: string | null | undefined): string | undefined {
    if (!text) return undefined;
    return text.replace(/\s+/g, ' ').trim() || undefined;
  }

  /**
   * Helper : parse une date texte en Date, retourne undefined si parsing échoue.
   */
  protected parseDate(input: string | null | undefined): Date | undefined {
    if (!input) return undefined;
    const d = new Date(input);
    return isNaN(d.getTime()) ? undefined : d;
  }
}
