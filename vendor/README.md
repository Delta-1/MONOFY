# Bundled browser dependencies

The academic editor loads these pinned files from the same static site. It does not require a package manager in production.

| Package | Version | Source | License |
| --- | --- | --- | --- |
| docx | 9.7.1 | https://www.npmjs.com/package/docx/v/9.7.1 | MIT, LICENSE-docx.txt |
| mammoth | 1.8.0 | https://www.npmjs.com/package/mammoth/v/1.8.0 | BSD-2-Clause, LICENSE-mammoth.txt |
| pdfjs-dist | 6.4.299 | https://www.npmjs.com/package/pdfjs-dist/v/6.4.299 | Apache-2.0, LICENSE-pdfjs.txt |

PDF.js uses its legacy browser builds and its matching worker. Optional character maps, standard fonts and WASM assets use the same pinned npm release on jsDelivr. Their package license is retained here. PDF evaluation is disabled. Update the reader and worker together.

The slide editor's existing optional libraries and the legacy UI still use CDNs. The academic workspace has no runtime framework dependency. The service worker caches the local essentials and PDF support assets, then uses network-first updates.
