import { Controller, Get } from '@nestjs/common';
import { CatalogService } from './catalog.service';

// Open to everyone: the request form needs these before sign-in.
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async get() {
    const [categories, texts] = await Promise.all([
      this.catalog.categories(),
      this.catalog.currentTexts(),
    ]);
    return {
      categories,
      consent: { version: texts.consent.version, body: texts.consent.body },
      attestation: {
        version: texts.attestation.version,
        body: texts.attestation.body,
      },
    };
  }
}
