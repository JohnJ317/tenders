import { Injectable } from '@nestjs/common';
import { AbstractScraper, ScraperResult } from '../abstract-scraper';

/**
 * Stubs de scrapers déclarés mais non implémentés.
 * Ils sont visibles dans le registre et la page admin /sources mais enabled=false.
 * Pour activer : ouvrir le fichier, implémenter scrape(), passer enabled à true.
 *
 * Les URLs indiquées ici sont les pages de référence à scraper.
 */

@Injectable()
export class ArmpSenegalScraper extends AbstractScraper {
  readonly sourceCode = 'ARMP_SN';
  readonly sourceLabel = 'ARMP Sénégal';
  readonly countries = ['SN'];
  readonly baseUrl = 'https://www.armp.sn';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    return { items: [], errors: ['Not implemented yet — see ' + this.baseUrl] };
  }
}

@Injectable()
export class ArcopBurkinaScraper extends AbstractScraper {
  readonly sourceCode = 'ARCOP_BF';
  readonly sourceLabel = 'ARCOP Burkina Faso';
  readonly countries = ['BF'];
  readonly baseUrl = 'https://www.arcop.bf';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    return { items: [], errors: ['Not implemented yet — see ' + this.baseUrl] };
  }
}

@Injectable()
export class DgmpMaliScraper extends AbstractScraper {
  readonly sourceCode = 'DGMP_ML';
  readonly sourceLabel = 'DGMP Mali';
  readonly countries = ['ML'];
  readonly baseUrl = 'https://www.dgmp.gouv.ml';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    return { items: [], errors: ['Not implemented yet'] };
  }
}

@Injectable()
export class ArmpTogoScraper extends AbstractScraper {
  readonly sourceCode = 'ARMP_TG';
  readonly sourceLabel = 'ARMP Togo';
  readonly countries = ['TG'];
  readonly baseUrl = 'https://armp.tg';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    return { items: [], errors: ['Not implemented yet'] };
  }
}

@Injectable()
export class ArmpBeninScraper extends AbstractScraper {
  readonly sourceCode = 'ARMP_BJ';
  readonly sourceLabel = 'ARMP Bénin';
  readonly countries = ['BJ'];
  readonly baseUrl = 'https://armp.bj';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    return { items: [], errors: ['Not implemented yet'] };
  }
}

@Injectable()
export class ArmpNigerScraper extends AbstractScraper {
  readonly sourceCode = 'ARMP_NE';
  readonly sourceLabel = 'ARMP Niger';
  readonly countries = ['NE'];
  readonly baseUrl = 'https://armp.ne';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    return { items: [], errors: ['Not implemented yet'] };
  }
}

@Injectable()
export class EuTedScraper extends AbstractScraper {
  readonly sourceCode = 'EU_TED';
  readonly sourceLabel = 'UE / TED';
  readonly countries = ['INTERNATIONAL'];
  readonly baseUrl = 'https://ted.europa.eu';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    // L'API TED nécessite l'auth OAuth — non trivial à implémenter sans clé
    return { items: [], errors: ['TED requires API key — see ted.europa.eu/api'] };
  }
}

@Injectable()
export class UsaidScraper extends AbstractScraper {
  readonly sourceCode = 'USAID_SAM';
  readonly sourceLabel = 'USAID (SAM.gov)';
  readonly countries = ['INTERNATIONAL'];
  readonly baseUrl = 'https://sam.gov';
  readonly enabled = false;
  async scrape(): Promise<ScraperResult> {
    // SAM.gov API exige une clé gratuite — à créer sur api.sam.gov
    return { items: [], errors: ['SAM.gov API key required'] };
  }
}
