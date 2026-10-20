const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const { unzipSync, strFromU8 } = require("fflate");
const C = require("../academic-core.js");
const D = require("../vendor/docx-9.7.1.js");
function environment() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    url: "https://example.test/",
  });
  dom.window.MonofyCore = C;
  dom.window.docx = D;
  dom.window.eval(
    fs.readFileSync(require.resolve("../academic-export.js"), "utf8"),
  );
  return dom;
}
function fixture() {
  const p = C.create("research", "es", "Trabajo de prueba");
  p.format.font = "Arial";
  p.format.size = 11;
  p.format.line = 2;
  p.sources = [
    {
      id: "source-one",
      name: "Libro.pdf",
      title: "Libro de prueba",
      author: "Autor Ejemplo",
      year: "2024",
      kind: "pdf",
      pages: [
        { number: 1, text: "La primera pagina no contiene evidencia." },
        {
          number: 2,
          text: "Cada cita debe apuntar al archivo y a la pagina de origen.",
        },
      ],
    },
  ];
  p.citations = [
    {
      id: "cite-one",
      sourceId: "source-one",
      page: 2,
      quote: "Cada cita debe apuntar al archivo y a la pagina de origen.",
    },
  ];
  p.sections = [
    {
      id: "section-one",
      title: "Introducción",
      html: '<p style="text-align:right">Texto <strong>en negrita</strong><br>segunda línea <em>cursiva</em><sub>2</sub><sup>3</sup> <a data-cite="cite-one">(Autor, 2024, p. 2)</a></p><h2>Subtítulo</h2><ol><li>Primero</li><li>Segundo<ul><li>Anidado</li></ul></li></ol><table><tbody><tr><th>Dato</th><th>Valor</th></tr><tr><td>A</td><td><p><b>42</b></p></td></tr></tbody></table><div>Texto suelto <b>con formato</b></div>',
    },
  ];
  return p;
}
async function exported(p, options) {
  const dom = environment();
  const blob = await dom.window.MonofyExport.build(p, options);
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  dom.window.close();
  return Object.fromEntries(
    Object.entries(zip)
      .filter(([n]) => n.endsWith(".xml"))
      .map(([n, b]) => [n, strFromU8(b)]),
  );
}
test("templates and languages produce independent local documents", () => {
  for (const type of Object.keys(C.types)) {
    const p = C.create(type, "es", "Tema");
    assert.equal(p.languageConfirmed, false);
    assert.equal(
      p.cover.find((b) => b.kind === "type").text,
      C.labels.es[type],
    );
    assert.ok(p.id);
    assert.notEqual(p.id, C.create(type).id);
  }
  assert.equal(C.create("monograph", "es").sections[0].title, "Resumen");
});
test("citation must exist on the exact source page; whitespace normalization is accepted", () => {
  const p = fixture();
  assert.equal(
    C.verifyCitation(p, "source-one", 2, "Cada cita debe apuntar al archivo"),
    true,
  );
  assert.equal(
    C.verifyCitation(p, "source-one", 1, "Cada cita debe apuntar al archivo"),
    false,
  );
  assert.equal(
    C.verifyCitation(p, "unknown", 2, "Cada cita debe apuntar al archivo"),
    false,
  );
  assert.equal(
    C.verifyCitation(p, "source-one", 2, "Frase inventada sin evidencia"),
    false,
  );
  assert.equal(C.verifyCitation(p, "source-one", 2, "cita"), false);
  assert.equal(
    C.verifyCitation(
      p,
      "source-one",
      2,
      "Cada cita\n debe   apuntar al archivo",
    ),
    true,
  );
});
test("DOCX includes exact page geometry, fonts, real numbering, line breaks and provenance footnotes", async () => {
  const xml = await exported(fixture());
  const body = xml["word/document.xml"];
  assert.match(body, /w:pgSz w:w="11906" w:h="16838"/);
  assert.match(body, /w:left="1701"/);
  assert.match(body, /w:right="1134"/);
  assert.match(body, /w:jc w:val="right"/);
  assert.match(body, /w:br/);
  assert.match(body, /w:numPr/);
  assert.match(body, /w:tbl/);
  assert.match(body, /w:vertAlign w:val="subscript"/);
  assert.match(body, /w:footnoteReference/);
  assert.match(xml["word/styles.xml"], /Arial/);
  assert.match(xml["word/styles.xml"], /w:line="480"/);
  assert.match(xml["word/footnotes.xml"], /Página del archivo 2/);
  assert.match(xml["word/footnotes.xml"], /Cada cita debe apuntar/);
  assert.match(body, /Referencias/);
  assert.match(body, /con formato/);
});
test("DOCX uses dynamic TOC field without estimated page numbers", async () => {
  const xml = await exported(fixture(), { toc: true });
  assert.match(xml["word/document.xml"], /TOC/);
  assert.match(xml["word/settings.xml"], /updateFields/);
});
test("invalid source citation never becomes a verified footnote", async () => {
  const p = fixture();
  p.citations[0].quote = "Una frase que no existe en esta pagina.";
  const xml = await exported(p);
  assert.doesNotMatch(xml["word/document.xml"], /w:footnoteReference/);
});
test("letter page dimensions and custom margins are emitted from the document model", async () => {
  const p = fixture();
  p.format.paper = "letter";
  p.format.margins = [2.54, 2.54, 2.54, 2.54];
  const xml = await exported(p);
  assert.match(xml["word/document.xml"], /w:pgSz w:w="12240" w:h="15840"/);
  assert.match(xml["word/document.xml"], /w:left="1440"/);
});
