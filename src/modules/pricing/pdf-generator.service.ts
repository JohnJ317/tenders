import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { NotFoundException } from '@nestjs/common';

/**
 * Génère une proposition financière PDF au format standard bailleur.
 * Structure :
 *   1. Entête cabinet + référence AO + date
 *   2. Tableau charges par grade × tarif horaire
 *   3. Coefficients appliqués
 *   4. Totaux : coût, prix HT, TVA, TTC
 *   5. Bloc signature
 */
@Injectable()
export class PricingPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(pricingId: string): Promise<Buffer> {
    // Charge la simulation avec tout le contexte
    const pricing = await this.prisma.tenderPricing.findFirst({
      where: { id: pricingId, tender: { cabinetId: TenantContext.tenantId() } },
      include: {
        tender: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!pricing) throw new NotFoundException('Simulation introuvable');

    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: TenantContext.tenantId() },
    });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    // Grille horaire active pour afficher les taux
    const today = new Date();
    const grilleLines = await this.prisma.grilleHoraire.findMany({
      where: {
        cabinetId: cabinet.id,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
    });
    const grille: Record<string, number> = {};
    for (const line of grilleLines) grille[line.grade] = Number(line.hourlyRate);

    // Génération
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.renderDocument(doc, pricing, cabinet, grille);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private renderDocument(doc: PDFKit.PDFDocument, pricing: any, cabinet: any, grille: Record<string, number>) {
    const currency = pricing.currency;
    const vatRate = Number(cabinet.vatRate);

    // ===== Entête =====
    doc.font('Helvetica-Bold').fontSize(16).text(cabinet.name, { align: 'left' });
    doc.font('Helvetica').fontSize(10).fillColor('#666');
    doc.text(`Pays : ${cabinet.country} | Devise : ${cabinet.currency}`);
    doc.moveDown(1.5);

    // Titre
    doc.fontSize(18).fillColor('#000').font('Helvetica-Bold');
    doc.text('PROPOSITION FINANCIÈRE', { align: 'center' });
    doc.moveDown(0.5);

    // Infos AO
    doc.fontSize(10).font('Helvetica');
    const t = pricing.tender;
    if (t.reference) doc.text(`Référence : ${t.reference}`);
    doc.text(`Objet : ${t.title}`);
    if (t.clientName) doc.text(`Client : ${t.clientName}`);
    if (t.sector) doc.text(`Secteur : ${t.sector}`);
    doc.text(`Date de proposition : ${formatDate(new Date())}`);
    if (t.submissionDeadline)
      doc.text(`Date limite de soumission : ${formatDate(new Date(t.submissionDeadline))}`);
    doc.moveDown(1);

    // ===== Section I : Charges par grade =====
    doc.font('Helvetica-Bold').fontSize(12).text('I. Répartition des charges par grade');
    doc.moveDown(0.5);

    const grades = [
      { key: 'ASSOCIE',   label: 'Associé',   hours: Number(pricing.associeHours) },
      { key: 'MANAGER',   label: 'Manager',   hours: Number(pricing.managerHours) },
      { key: 'SENIOR',    label: 'Senior',    hours: Number(pricing.seniorHours) },
      { key: 'JUNIOR',    label: 'Junior',    hours: Number(pricing.juniorHours) },
      { key: 'ASSISTANT', label: 'Assistant', hours: Number(pricing.assistantHours) },
    ];

    const cols = { label: 50, hours: 210, rate: 300, total: 420 };
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Grade',       cols.label, doc.y, { width: 150 });
    doc.text('Heures',      cols.hours, doc.y - 12, { width: 80,  align: 'right' });
    doc.text('Taux horaire',cols.rate,  doc.y - 12, { width: 110, align: 'right' });
    doc.text('Total',       cols.total, doc.y - 12, { width: 130, align: 'right' });
    doc.moveDown(0.5);
    drawLine(doc);

    let laborCost = 0;
    doc.font('Helvetica').fontSize(10);
    for (const g of grades) {
      if (g.hours === 0) continue;
      const rate = grille[g.key] ?? 0;
      const total = g.hours * rate;
      laborCost += total;
      const y = doc.y;
      doc.text(g.label,                 cols.label, y, { width: 150 });
      doc.text(g.hours.toFixed(2),      cols.hours, y, { width: 80,  align: 'right' });
      doc.text(formatMoney(rate, currency),  cols.rate,  y, { width: 110, align: 'right' });
      doc.text(formatMoney(total, currency), cols.total, y, { width: 130, align: 'right' });
      doc.moveDown(0.5);
    }
    drawLine(doc);
    doc.font('Helvetica-Bold');
    doc.text('Total honoraires', cols.label, doc.y, { width: 150 });
    doc.text(formatMoney(laborCost, currency), cols.total, doc.y - 12, { width: 130, align: 'right' });
    doc.moveDown(1.5);

    // ===== Section II : Frais remboursables =====
    const travelCost = Number(pricing.travelCost);
    const otherCosts = Number(pricing.otherCosts);
    if (travelCost > 0 || otherCosts > 0) {
      doc.font('Helvetica-Bold').fontSize(12).text('II. Frais remboursables');
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(10);

      if (travelCost > 0) {
        const y = doc.y;
        doc.text('Déplacements et per diem', cols.label, y);
        doc.text(formatMoney(travelCost, currency), cols.total, y, { width: 130, align: 'right' });
        doc.moveDown(0.5);
      }
      if (otherCosts > 0) {
        const y = doc.y;
        doc.text(pricing.otherCostsLabel ?? 'Autres frais', cols.label, y);
        doc.text(formatMoney(otherCosts, currency), cols.total, y, { width: 130, align: 'right' });
        doc.moveDown(0.5);
      }
      drawLine(doc);
      doc.font('Helvetica-Bold');
      doc.text('Total frais', cols.label, doc.y);
      doc.text(formatMoney(travelCost + otherCosts, currency), cols.total, doc.y - 12, { width: 130, align: 'right' });
      doc.moveDown(1.5);
    }

    // ===== Section III : Coefficients appliqués =====
    const coefs = pricing.coefficientsSnapshot as Array<{
      code: string; label: string; category: string; multiplier: number;
    }>;
    if (coefs && coefs.length > 0) {
      doc.font('Helvetica-Bold').fontSize(12).text('III. Coefficients appliqués');
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(9);
      for (const c of coefs) {
        const pct = ((c.multiplier - 1) * 100).toFixed(1);
        const sign = Number(pct) >= 0 ? '+' : '';
        doc.text(`• ${c.label} (${sign}${pct}%)`, cols.label);
      }
      const combinedMultiplier = coefs.reduce((acc, c) => acc * c.multiplier, 1);
      doc.font('Helvetica-Bold').moveDown(0.3);
      doc.text(`Multiplicateur combiné : ×${combinedMultiplier.toFixed(3)}`, cols.label);
      doc.moveDown(1);
    }

    // ===== Section IV : Synthèse financière =====
    doc.font('Helvetica-Bold').fontSize(12).text('IV. Synthèse financière');
    doc.moveDown(0.5);

    const baseCost = Number(pricing.baseCost);
    const adjustedCost = Number(pricing.adjustedCost);
    const targetPrice = Number(pricing.targetPrice);
    const vat = targetPrice * vatRate;
    const ttc = targetPrice + vat;

    const lines: Array<[string, number, boolean]> = [
      ['Coût de revient',               baseCost,     false],
      ['Coût ajusté (après coefficients)', adjustedCost, false],
      ['Montant HT proposé',            targetPrice,  true],
      [`TVA (${(vatRate * 100).toFixed(2)}%)`, vat,   false],
      ['Montant TTC',                   ttc,          true],
    ];
    doc.fontSize(10);
    for (const [label, amount, bold] of lines) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      const y = doc.y;
      doc.text(label, cols.label, y, { width: 300 });
      doc.text(formatMoney(amount, currency), cols.total, y, { width: 130, align: 'right' });
      doc.moveDown(0.5);
    }
    doc.moveDown(0.5);

    // Montant en lettres
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#444');
    doc.text(`Montant TTC : ${amountInWords(ttc)} ${currency === 'XOF' ? 'francs CFA' : currency} TTC`,
             cols.label, doc.y, { width: 500 });
    doc.fillColor('#000');
    doc.moveDown(2);

    // ===== Signature =====
    doc.font('Helvetica').fontSize(10);
    doc.text(`Fait à ${cabinet.country}, le ${formatDate(new Date())}`);
    doc.moveDown(2);
    if (pricing.createdBy) {
      doc.text(`${pricing.createdBy.firstName} ${pricing.createdBy.lastName}`);
      doc.text('Pour ' + cabinet.name, { continued: false });
    }
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#888');
    doc.text(`Document généré automatiquement - Simulation "${pricing.name}" - ${new Date().toISOString()}`,
             { align: 'center' });
  }
}

// ---- Helpers ----

function drawLine(doc: PDFKit.PDFDocument) {
  const y = doc.y;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#ccc').stroke();
  doc.strokeColor('#000');
  doc.moveDown(0.3);
}

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
  return `${formatted} ${currency}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Convertit un montant en toutes lettres en français.
 * Simplifié — couvre jusqu'à 999 999 999 999 (999 milliards).
 */
function amountInWords(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return 'zéro';
  return toWords(n).trim().replace(/\s+/g, ' ');
}

function toWords(n: number): string {
  if (n === 0) return '';
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
                 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
                 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
                'soixante', 'quatre-vingt', 'quatre-vingt'];
  if (n < 20) return units[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (t === 7 || t === 9) return tens[t] + '-' + units[10 + u];
    if (u === 0) return tens[t] + (t === 8 ? 's' : '');
    if (u === 1 && t !== 8) return tens[t] + ' et un';
    return tens[t] + '-' + units[u];
  }
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const r = n % 100;
    const cents = c === 1 ? 'cent' : units[c] + ' cent' + (r === 0 ? 's' : '');
    return cents + (r > 0 ? ' ' + toWords(r) : '');
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000);
    const r = n % 1000;
    const mille = k === 1 ? 'mille' : toWords(k) + ' mille';
    return mille + (r > 0 ? ' ' + toWords(r) : '');
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000);
    const r = n % 1_000_000;
    const mil = m === 1 ? 'un million' : toWords(m) + ' millions';
    return mil + (r > 0 ? ' ' + toWords(r) : '');
  }
  const g = Math.floor(n / 1_000_000_000);
  const r = n % 1_000_000_000;
  const mrd = g === 1 ? 'un milliard' : toWords(g) + ' milliards';
  return mrd + (r > 0 ? ' ' + toWords(r) : '');
}
