# Backend — Ajout du filtre isEoi dans ScrapedTendersController

## Fichier concerné

`~/Documents/offre/src/modules/scraped-tenders/scraped-tenders.controller.ts`

## Modification

Trouve la méthode `list` (ligne 146-147) :

```typescript
@Get()
list(@Query('status') status?: 'MATCHED' | 'PROMOTED' | 'ALL') {
```

Remplace par :

```typescript
@Get()
list(
  @Query('status') status?: 'MATCHED' | 'PROMOTED' | 'ALL',
  @Query('isEoi') isEoi?: string,
  @CurrentUser() user?: JwtPayload,
) {
  const isEoiBool = isEoi === 'true' ? true : isEoi === 'false' ? false : undefined;
  return this.service.list(user!.cabinetId, status, isEoiBool);
}
```

## Fichier service

`~/Documents/offre/src/modules/scraped-tenders/scraped-tenders.service.ts`

Trouve la méthode `list` et adapte-la pour accepter le paramètre `isEoi` optionnel :

```typescript
async list(cabinetId: string, status?: 'MATCHED' | 'PROMOTED' | 'ALL', isEoi?: boolean) {
  const where: any = {
    matchedCabinetIds: { has: cabinetId },
  };

  if (status && status !== 'ALL') {
    where.status = status;
  }

  if (isEoi !== undefined) {
    where.isEoi = isEoi;
  }

  return this.prisma.scrapedTender.findMany({
    where,
    orderBy: { scrapedAt: 'desc' },
    take: 500,
  });
}
```

## Si tu préfères ne PAS toucher au backend

Tu peux filtrer côté frontend après le fetch : `.filter(t => t.isEoi === true)`.
Mais c'est moins propre pour les gros volumes.
