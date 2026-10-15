
import { extractProjectCode, registerOfferProjects } from './src/lib/projectUtils.ts';

const mockOffers = [
  { apelido_interno: '[WL-COD-PL]', produto_real: 'WL POLONIA' },
  { apelido_interno: '[WL-COD-ROM]', produto_real: 'WL ROMENIA' },
  { apelido_interno: '[ED-COD-BUL]', produto_real: 'ED BULGARIA' }
];

registerOfferProjects(mockOffers);

const testName = "[FB] [DAVID] [EST 4 - CA HT 278746] [COD] [WL-COD-PL] [F1] [CATALOGO] [CBO 1-1-1] [VTPAD74H2] [17/08/26] - CAMP01";
const result = extractProjectCode(testName);
console.log("Q1d Result:", result);

// Debug direct extraction
import { extractProjectCodeFromNaming } from './src/lib/projectUtils.ts';
console.log("Direct naming extract:", extractProjectCodeFromNaming(testName));
