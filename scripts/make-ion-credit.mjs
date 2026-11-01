import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const srcLogo = process.argv[2];
const destLogo = resolve("runner/metrocim-logo.png");
if (srcLogo) {
  copyFileSync(srcLogo, destLogo);
}

const logo = readFileSync(destLogo).toString("base64");
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="176" height="28" viewBox="0 0 176 28" role="img" aria-label="MetroCIM ion">
  <image href="data:image/png;base64,${logo}" x="0" y="2" width="24" height="24"/>
  <text x="30" y="19" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#f4f7fa">MetroCIM</text>
  <text x="108" y="19" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" font-weight="400" fill="#c5ced6">ion</text>
</svg>
`;
writeFileSync(resolve("runner/metrocim-ion-credit.svg"), svg);
console.log("wrote runner/metrocim-ion-credit.svg");
