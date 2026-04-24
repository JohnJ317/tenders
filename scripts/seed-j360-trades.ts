/**
 * Script de seed pour peupler la table j360_trade_catalog avec les 116 trades
 * J360 et leurs catégories. À exécuter une fois après la migration Prisma.
 *
 * Usage : npx ts-node scripts/seed-j360-trades.ts
 *
 * Idempotent : utilise upsert, peut être relancé sans doublons.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TradeSeed {
  id: number;
  name: string;
  summary: string;
  categories: Array<{ id: number; name: string }>;
}

// Les 116 trades J360 tels que retournés par GET /api/trades/ (extraits de la conversation).
// Mise à jour : avril 2026. Si J360 ajoute des trades, relancer ce seed avec la liste complète.
const TRADES: TradeSeed[] = [
  { id: 141, name: "Actes notariés, créances, enchères, courtage", summary: "Recouvrement de créances, services d'huissiers, actes notariés", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 62, name: "Action sociale et humanitaire", summary: "Insertion sociale, action humanitaire et Droits de l'Homme", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 33, name: "Activités periscolaires, sport et loisirs", summary: "Organisation de classes de découverte, séjours pédagogiques", categories: [{ id: 4, name: "Culture, loisir, restauration" }, { id: 11, name: "Sanitaire, social" }] },
  { id: 131, name: "Administration des systèmes informatiques", summary: "Administration, sécurité, exploitation, maintenance", categories: [{ id: 9, name: "Informatique, télécoms" }] },
  { id: 18, name: "Aménagement d'interieur", summary: "Aménagement d'espaces, architecture d'intérieur", categories: [{ id: 13, name: "Urbanisme, immobilier" }] },
  { id: 15, name: "Analyse financière, comptabilité", summary: "Conseils financiers, optimisation fiscale, commissaires aux comptes, services comptables", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 2, name: "Animaux et services vétérinaires", summary: "Services et produits vétérinaires, fourrières", categories: [{ id: 4, name: "Culture, loisir, restauration" }, { id: 11, name: "Sanitaire, social" }] },
  { id: 80, name: "Appui bureautique, centre d'appels, traduction", summary: "Appui bureautique, accueil physique et téléphonique", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 37, name: "Archives, documentation", summary: "Gestion des archives et des bibliothèques, numérisation", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 129, name: "Armes, matériels militaires", summary: "Armes, munitions, équipements militaires", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 46, name: "Articles ménagers, matériels de cuisine", summary: "Articles ménagers, matériels d'hygiène", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 34, name: "Artistes", summary: "Création et restauration oeuvres d'art", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 79, name: "Ascenseurs", summary: "Ascenseurs, escaliers mécaniques, monte-charges", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 23, name: "Assurances", summary: "Services d'assurances des biens et personnes", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 147, name: "Blanchisserie, pressing", summary: "Blanchisserie, pressing, nettoyage de vêtements", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 20, name: "Bois, exploitation forestière", summary: "Fourniture de bois, gestion de forêts", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 148, name: "Boissons", summary: "Eaux minérales, jus, vins", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 52, name: "Bâtiments modulaires, échafaudages", summary: "Constructions modulaires, préfabriqués", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 93, name: "Chauffage, climatisation, ventilation", summary: "Chauffage, fumisterie, climatisation", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 40, name: "Communication digitale", summary: "Sites web, applications mobiles, webmarketing", categories: [{ id: 2, name: "Communication, média" }, { id: 9, name: "Informatique, télécoms" }] },
  { id: 136, name: "Communication écrite et visuelle", summary: "Communication graphique, rédaction de journaux", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 14, name: "Conseil banque, assurance, protection sociale", summary: "Conseil pour le secteur bancaire, l'assurance", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 60, name: "Conseil ressources humaines", summary: "Orientation et transition professionnelle, GPEC", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 122, name: "Construction, bâtiments", summary: "Travaux de construction de bâtiments", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 133, name: "Consulting IT", summary: "Conseil, infogérance, support en informatique", categories: [{ id: 3, name: "Consulting, formation, finance" }, { id: 9, name: "Informatique, télécoms" }] },
  { id: 139, name: "Consulting, audit, qualité", summary: "Conseils, accompagnements, audit, qualité", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 142, name: "Contrôles techniques, ingénierie des bâtiments", summary: "Contrôles techniques, sécurité, incendie", categories: [{ id: 13, name: "Urbanisme, immobilier" }] },
  { id: 109, name: "Couverture, charpente, étanchéité", summary: "Couverture, charpente, étanchéité", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 8, name: "Déchets", summary: "Services et matériels de collecte, traitement et recyclage", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 132, name: "Développement informatique", summary: "Développement et programmation d'outils informatiques", categories: [{ id: 9, name: "Informatique, télécoms" }] },
  { id: 10, name: "Eau potable, assainissement", summary: "Travaux, équipements et traitement des eaux", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 29, name: "Elearning", summary: "Plateformes et formations d'apprentissage à distance", categories: [{ id: 2, name: "Communication, média" }, { id: 3, name: "Consulting, formation, finance" }] },
  { id: 94, name: "Engins, camions, véhicules d'entretien", summary: "Tractopelles, tombereaux, engins, camions", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 61, name: "Enseignement, formations", summary: "Enseignement, programmes de formation", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 16, name: "Espaces verts", summary: "Aménagements paysagers, entretien de jardins", categories: [{ id: 12, name: "Travaux, construction" }, { id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 81, name: "Facilities management, inspections des bâtiments", summary: "Facilities management, maintenance multi-techniques", categories: [{ id: 13, name: "Urbanisme, immobilier" }] },
  { id: 121, name: "Fermetures et fenêtres", summary: "Fermetures, vitrerie, automatismes", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 55, name: "Formations bureautique, langues, ressources humaines", summary: "Formations bureautique, informatique, langues", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 68, name: "Fret, dédouanement, déménagement", summary: "Transport de marchandises, logistique", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 88, name: "Funéraire", summary: "Articles et services funéraires", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 19, name: "Horticulture, semences", summary: "Pépiniéristes, horticulteurs, plantations", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 104, name: "Hydrocarbures, énergie, minerais, métaux", summary: "Carburant, gaz, pétrole, électricité", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }, { id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 63, name: "Hébergement social", summary: "Gestion de crèches, centres d'accueil", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 28, name: "Hôtellerie", summary: "Prestations hôtelières, accueil de conférences", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 115, name: "Immobilier", summary: "Promotion immobilière, vente et location de biens", categories: [{ id: 3, name: "Consulting, formation, finance" }, { id: 13, name: "Urbanisme, immobilier" }] },
  { id: 143, name: "Ingénierie des infrastructures", summary: "Ingénierie des infrastructures et des ouvrages d'art", categories: [{ id: 13, name: "Urbanisme, immobilier" }] },
  { id: 65, name: "Insertion sociale", summary: "Ateliers d'insertion, accompagnement des demandeurs", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 31, name: "Instruments de musique", summary: "Fourniture, maintenance, accordage de pianos", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 32, name: "Jeux, jouets", summary: "Jeux éducatifs, marionnettes, matériel pédagogique", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 24, name: "Juridique, contrats", summary: "Avocats, conseils et représentation en justice", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 38, name: "Livres, journaux, matériels pédagogiques", summary: "Livres, journaux, CD, DVD, fournitures scolaires", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 70, name: "Location de véhicules et engins", summary: "Location de moyens de transport et d'engins", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 105, name: "Logiciels de gestion et bureautique", summary: "Logiciels bureautiques, applications informatiques", categories: [{ id: 9, name: "Informatique, télécoms" }] },
  { id: 49, name: "Matériaux et quincaillerie", summary: "Matériaux et fourniture pour la construction", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }, { id: 12, name: "Travaux, construction" }] },
  { id: 83, name: "Matériel de bureau et papeterie", summary: "Fournitures de bureau, fournitures scolaires", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 82, name: "Matériel de reprographie et 3D", summary: "Imprimantes, scanners, matériel d'imprimerie", categories: [{ id: 9, name: "Informatique, télécoms" }] },
  { id: 48, name: "Matériels agricoles et agroalimentaires", summary: "Tracteur, moissonneuse, tondeuse", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 30, name: "Matériels de sport et loisirs", summary: "Articles de sports et loisirs, sols sportifs", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 126, name: "Matériels médicaux", summary: "Matériels et équipements médicaux", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 120, name: "Maçonnerie, gros œuvre, désamiantage", summary: "Maçonnerie, gros œuvre, fondations", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 127, name: "Menuiserie", summary: "Menuiserie, escaliers, agencement", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 96, name: "Mobilier urbain, signalisation, circulation routière", summary: "Signalisation, mobilier urbain, stationnement", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 87, name: "Mobilier, ameublement", summary: "Mobilier, ameublement", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 89, name: "Mode, vêtements, textiles", summary: "Vêtements, uniformes, tailleur, chaussures", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 125, name: "Médicaments, produits pharmaceutiques", summary: "Médicaments, produits pharmaceutiques", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 86, name: "Métrologie, équipements de laboratoire", summary: "Instruments de mesure, matériels de laboratoires", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 107, name: "Nettoyage de la voirie", summary: "Services de balayage, nettoiement, déneigement", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 97, name: "Nettoyage, entretien ménager, désinfection", summary: "Nettoyage, entretien ménager, services de propreté", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 146, name: "Océan et économie de la mer", summary: "Océanographie, économie de la mer, offshore", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 13, name: "Paysagiste", summary: "Services des paysagistes, études paysage", categories: [{ id: 13, name: "Urbanisme, immobilier" }] },
  { id: 66, name: "Peinture, sols, cloisons, façades", summary: "Peinture, revêtements de sol, chapes", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 124, name: "Plomberie, tuyauterie, chaudronnerie", summary: "Plomberie, tuyauterie, chaudronnerie", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 12, name: "Produits alimentaires et agricoles", summary: "Plats préparés, surgelés, céréales, fruits et légumes", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 100, name: "Produits chimiques, engrais", summary: "Produits chimiques, engrais, oxygène", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 99, name: "Produits d'entretien et de soins", summary: "Produits d'entretien, de nettoyage", categories: [{ id: 11, name: "Sanitaire, social" }, { id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 45, name: "Publicité et marketing", summary: "Plan de communication, relations presse", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 118, name: "Recherche, développement, partenariats", summary: "R&D, appels à idées, expérimentations", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 53, name: "Recrutement, interim", summary: "Services d'aide au recrutement, mise à disposition", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 6, name: "Restauration, cantine, repas", summary: "Gestion de restaurants, cantines, bar", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 36, name: "Scénographie, expositions, feux d'artifices", summary: "Scénographie, muséographie", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 95, name: "Serrurerie, métallerie", summary: "Serrurerie, métallerie, clôtures", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 22, name: "Services bancaires", summary: "Gestion de portefeuilles, investissements, crédit", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 140, name: "Services de soins, médecine", summary: "Soins et examens médicaux", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 145, name: "Services de sécurité, secours", summary: "Services de gardiennage, surveillance", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 44, name: "Signalétique, stands, objets publicitaires", summary: "Vitrines, enseignes, panneaux publicitaires", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 113, name: "Sécurité informatique", summary: "Conseil en sécurité informatique, tests d'intrusion", categories: [{ id: 9, name: "Informatique, télécoms" }] },
  { id: 17, name: "Topographie, foncier", summary: "Topographie, cartographie, géomètre", categories: [{ id: 13, name: "Urbanisme, immobilier" }, { id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 5, name: "Traiteur", summary: "Services de traiteur, cocktails, livraison de repas", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 69, name: "Transport de voyageurs, sanitaire, taxi", summary: "Transports collectifs, scolaires, sanitaires", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 76, name: "Transport express, colis, courriers", summary: "Livraison express, acheminement de colis", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 39, name: "Travaux d'impression", summary: "Travaux d'impression, éditique, publications", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 35, name: "Travaux de voirie, réseaux, terrassement, forage", summary: "Travaux de voirie, réseaux enterrés", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 123, name: "Travaux publics", summary: "Travaux d'ouvrages d'art, infrastructures", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 135, name: "Télécom, réseaux VDI", summary: "Services de télécommunication", categories: [{ id: 9, name: "Informatique, télécoms" }] },
  { id: 11, name: "Vidéos, films, radio, photos", summary: "Production audiovisuelle, tournages", categories: [{ id: 2, name: "Communication, média" }] },
  { id: 90, name: "Vidéosurveillance, équipements de sécurité", summary: "Vidéosurveillance, contrôle d'accès", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }, { id: 9, name: "Informatique, télécoms" }, { id: 12, name: "Travaux, construction" }] },
  { id: 73, name: "Voitures, bus, deux roues", summary: "Achat et entretien de véhicules", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 27, name: "Voyages, billets", summary: "Organisation de voyages, réservation de billets", categories: [{ id: 4, name: "Culture, loisir, restauration" }, { id: 10, name: "Mobilité, transport" }] },
  { id: 78, name: "Électricité, domotique", summary: "Électricité, domotique, GTC, câblage", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 77, name: "Électrification, éclairage public", summary: "Électrification, éclairage public, transformateur", categories: [{ id: 12, name: "Travaux, construction" }] },
  { id: 106, name: "Énergies renouvelables", summary: "Énergies solaire, éolienne, hydraulique", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 103, name: "Équipements audiovisuels", summary: "Matériels audiovisuels, scéniques, photographiques", categories: [{ id: 2, name: "Communication, média" }, { id: 9, name: "Informatique, télécoms" }] },
  { id: 137, name: "Équipements aéronautiques", summary: "Avions, équipements aéronautiques, hélicoptères", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 85, name: "Équipements et vêtements de protection", summary: "Équipements de protection et de sécurité", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 72, name: "Équipements ferroviaires, transports par câble", summary: "Trains et équipements ferroviaires", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 59, name: "Équipements industriels et générateurs", summary: "Équipements et machines industriels, générateurs", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }, { id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 74, name: "Équipements maritimes", summary: "Navires, matériels et gestion des équipements maritimes", categories: [{ id: 10, name: "Mobilité, transport" }] },
  { id: 101, name: "Équipements sportifs, loisirs, commerces, bien-être", summary: "Gestion de piscines, patinoires, bowlings", categories: [{ id: 4, name: "Culture, loisir, restauration" }] },
  { id: 144, name: "Équipements électriques et éclairage", summary: "Équipements et matériels électriques, éclairage", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }, { id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 134, name: "Équipements électroniques et informatiques", summary: "Matériels informatiques, électroniques", categories: [{ id: 8, name: "Industrie, sécurité, matériels" }, { id: 9, name: "Informatique, télécoms" }] },
  { id: 130, name: "Études entreprises, innovation, processus", summary: "Études industrie, entreprises, développement", categories: [{ id: 3, name: "Consulting, formation, finance" }, { id: 8, name: "Industrie, sécurité, matériels" }] },
  { id: 91, name: "Études environnementales, eau et air", summary: "Études environnementales, eau, air, acoustique", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 110, name: "Études mobilité et transport", summary: "Études de mobilité, déplacement, transport", categories: [{ id: 3, name: "Consulting, formation, finance" }, { id: 10, name: "Mobilité, transport" }] },
  { id: 116, name: "Études santé", summary: "Études santé publique, laboratoire et médico-social", categories: [{ id: 11, name: "Sanitaire, social" }] },
  { id: 111, name: "Études tourisme, culture, sport", summary: "Études tourisme, patrimoine, culture, art", categories: [{ id: 3, name: "Consulting, formation, finance" }, { id: 4, name: "Culture, loisir, restauration" }] },
  { id: 21, name: "Études urbaines et architecturales", summary: "Études urbaines, architecture, programmation", categories: [{ id: 13, name: "Urbanisme, immobilier" }] },
  { id: 92, name: "Études écologiques et agroalimentaires", summary: "Études écologiques, agroalimentaires et nutrition", categories: [{ id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 114, name: "Études énergies", summary: "Études sur énergies fossiles et renouvelables", categories: [{ id: 3, name: "Consulting, formation, finance" }, { id: 6, name: "Énergie, environnement, hygiène" }] },
  { id: 138, name: "Études, évaluations, enquêtes", summary: "Études stratégiques, évaluations, enquêtes", categories: [{ id: 3, name: "Consulting, formation, finance" }] },
  { id: 128, name: "Événementiel", summary: "Organisation de salons et événements culturels", categories: [{ id: 2, name: "Communication, média" }] },
];

async function main() {
  console.log(`Seed j360_trade_catalog : ${TRADES.length} trades...`);

  let created = 0;
  let updated = 0;

  for (const trade of TRADES) {
    const existed = await prisma.j360TradeCatalog.findUnique({ where: { id: trade.id } });
    await prisma.j360TradeCatalog.upsert({
      where: { id: trade.id },
      update: {
        name: trade.name,
        summary: trade.summary,
        categories: trade.categories as any,
      },
      create: {
        id: trade.id,
        name: trade.name,
        summary: trade.summary,
        categories: trade.categories as any,
      },
    });
    if (existed) updated++;
    else created++;
  }

  console.log(`✓ ${created} trades créés, ${updated} mis à jour.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
