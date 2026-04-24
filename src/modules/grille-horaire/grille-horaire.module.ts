import { Module } from '@nestjs/common';
import { GrilleHoraireController } from './grille-horaire.controller';
import { GrilleHoraireService } from './grille-horaire.service';

@Module({
  controllers: [GrilleHoraireController],
  providers: [GrilleHoraireService],
  exports: [GrilleHoraireService],
})
export class GrilleHoraireModule {}
