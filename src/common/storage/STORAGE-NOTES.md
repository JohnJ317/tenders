# Ajouts nécessaires au StorageService

Vérifie que ton `storage.service.ts` a bien ces méthodes. Sinon ajoute-les :

## Fichier : `~/Documents/offre/src/common/storage/storage.service.ts`

Les méthodes `uploadFile`, `deleteFile` et `getSignedUrl` doivent exister.
Si elles n'existent pas sous ce nom (tu utilises peut-être des noms différents
comme `upload`, `delete`, `getPresignedUrl`), adapte-les :

Option 1 — Renommer les appels dans `consultants.module.ts` :
```typescript
// Remplace :
await this.storage.uploadFile(key, file.buffer, file.mimetype);
// Par ce que tu utilises, par exemple :
await this.storage.upload(key, file.buffer, file.mimetype);

// Idem pour deleteFile / getSignedUrl
```

Option 2 — Ajouter les alias dans le StorageService :
```typescript
async uploadFile(key: string, buffer: Buffer, contentType: string) {
  // implémentation existante
}

async deleteFile(key: string) {
  // implémentation existante
}

async getSignedUrl(key: string, expiresInSeconds: number) {
  // implémentation existante
}
```

Si tu n'es pas sûr, montre-moi le contenu de ton StorageService et je te dirai
exactement quoi ajuster.
