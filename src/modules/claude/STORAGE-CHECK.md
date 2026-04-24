// ============================================================================
// VÉRIFICATION : StorageService.downloadAsBuffer()
// ============================================================================
//
// Mon code d'analyse utilise cette méthode pour récupérer les PDFs depuis MinIO.
// Si elle n'existe pas encore, ajoute-la à ton StorageService.
//
// Vérifie si elle existe :
//
//   grep -n "downloadAsBuffer" ~/Documents/offre/src/common/storage/storage.service.ts
//
// Si la commande ne retourne rien, ajoute cette méthode dans ta classe StorageService :
// ============================================================================

/*
  async downloadAsBuffer(storageKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucketName, storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }
*/

// ============================================================================
// Si ton StorageService utilise une autre librairie que `minio` (ex: `@aws-sdk/client-s3`),
// l'implémentation diffère. Colle-moi le fichier storage.service.ts et je l'adapte.
// ============================================================================
