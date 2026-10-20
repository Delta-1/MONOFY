/* Shared, deterministic document model. No network or database dependency. */
(function (root) {
  "use strict";
  const types = {
    research: [
      "Trabalho de investigação",
      [
        "Introdução",
        "Objetivos",
        "Metodologia",
        "Desenvolvimento",
        "Conclusão",
      ],
    ],
    monograph: [
      "Monografia",
      [
        "Resumo",
        "Introdução",
        "Metodologia",
        "Marco teórico",
        "Discussão",
        "Conclusão",
      ],
    ],
    report: [
      "Relatório",
      ["Introdução", "Procedimentos", "Resultados", "Conclusão"],
    ],
    mindmap: ["Mapa mental", []],
    conceptmap: ["Mapa conceitual", []],
    blank: ["Documento livre", ["Texto"]],
  };
  const labels = {
    pt: {
      research: "Trabalho de investigação",
      monograph: "Monografia",
      report: "Relatório",
      mindmap: "Mapa mental",
      conceptmap: "Mapa conceitual",
      blank: "Documento",
      references: "Referências",
      contents: "Sumário",
      subject: "Disciplina",
      teacher: "Docente",
      author: "Autor",
      summary: "Resumo",
    },
    es: {
      research: "Trabajo de investigación",
      monograph: "Monografía",
      report: "Informe",
      mindmap: "Mapa mental",
      conceptmap: "Mapa conceptual",
      blank: "Documento",
      references: "Referencias",
      contents: "Índice",
      subject: "Asignatura",
      teacher: "Docente",
      author: "Autor",
      summary: "Resumen",
    },
    en: {
      research: "Research paper",
      monograph: "Monograph",
      report: "Report",
      mindmap: "Mind map",
      conceptmap: "Concept map",
      blank: "Document",
      references: "References",
      contents: "Contents",
      subject: "Subject",
      teacher: "Supervisor",
      author: "Author",
      summary: "Abstract",
    },
  };
  const translations = {
    es: {
      Introdução: "Introducción",
      Objetivos: "Objetivos",
      Metodologia: "Metodología",
      Desenvolvimento: "Desarrollo",
      Conclusão: "Conclusiones",
      Resumo: "Resumen",
      "Marco teórico": "Marco teórico",
      Discussão: "Discusión",
      Procedimentos: "Procedimientos",
      Resultados: "Resultados",
      Texto: "Texto",
    },
    en: {
      Introdução: "Introduction",
      Objetivos: "Objectives",
      Metodologia: "Methodology",
      Desenvolvimento: "Development",
      Conclusão: "Conclusion",
      Resumo: "Abstract",
      "Marco teórico": "Theoretical framework",
      Discussão: "Discussion",
      Procedimentos: "Procedures",
      Resultados: "Results",
      Texto: "Text",
    },
  };
  const uid = () =>
    "m" +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2));
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
  function create(
    type = "research",
    language = "pt",
    title = "Sem título",
    norm = "abnt",
  ) {
    if (!types[type]) type = "research";
    return {
      version: 1,
      id: uid(),
      title,
      type,
      language,
      languageConfirmed: false,
      updated: Date.now(),
      norm,
      format: {
        font: "Times New Roman",
        size: 12,
        line: 1.5,
        paper: "a4",
        margins: norm === "abnt" ? [3, 2, 2, 3] : [2.54, 2.54, 2.54, 2.54],
        indent: 1.25,
      },
      cover: [
        { id: uid(), kind: "institution", text: "" },
        { id: uid(), kind: "author", text: "" },
        { id: uid(), kind: "type", text: labels[language][type] },
        { id: uid(), kind: "title", text: title },
        { id: uid(), kind: "details", text: "" },
        { id: uid(), kind: "location", text: "" },
        { id: uid(), kind: "year", text: String(new Date().getFullYear()) },
      ],
      sections: types[type][1].map((t) => ({
        id: uid(),
        title: translations[language]?.[t] || t,
        html: "<p><br></p>",
      })),
      sources: [],
      citations: [],
      chat: [],
      map: {
        nodes: [
          { id: "root", text: title, x: 220, y: 180 },
          {
            id: "a",
            text:
              language === "es"
                ? "Concepto 1"
                : language === "en"
                  ? "Concept 1"
                  : "Conceito 1",
            x: 20,
            y: 40,
          },
          {
            id: "b",
            text:
              language === "es"
                ? "Concepto 2"
                : language === "en"
                  ? "Concept 2"
                  : "Conceito 2",
            x: 420,
            y: 40,
          },
          {
            id: "c",
            text:
              language === "es"
                ? "Concepto 3"
                : language === "en"
                  ? "Concept 3"
                  : "Conceito 3",
            x: 220,
            y: 330,
          },
        ],
        edges: [
          { from: "root", to: "a", label: "" },
          { from: "root", to: "b", label: "" },
          { from: "root", to: "c", label: "" },
        ],
      },
    };
  }
  function verifyCitation(project, sourceId, page, quote) {
    const source = project.sources.find((s) => s.id === sourceId);
    const text = source?.pages?.find((p) => p.number === Number(page))?.text;
    return !!(
      text &&
      normalize(quote).length >= 12 &&
      normalize(text).includes(normalize(quote))
    );
  }
  function reference(source, style = "apa", language = "pt") {
    const author =
      source.author ||
      {
        pt: "Autoria não informada",
        es: "Autoría no informada",
        en: "Author not provided",
      }[language];
    const year = source.year || (language === "en" ? "n.d." : "s.d.");
    const title = source.title || source.name;
    if (style === "abnt")
      return [
        author.toUpperCase() + ".",
        title + ".",
        source.publisher ? source.publisher + "," : "",
        year.replace(/\.$/, "") + ".",
        source.url || "",
      ]
        .filter(Boolean)
        .join(" ");
    return [
      author + ".",
      "(" + year + ").",
      title + ".",
      source.publisher ? source.publisher + "." : "",
      source.url || "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  function usedCitations(project) {
    const ids = new Set(
      project.sections.flatMap((s) =>
        Array.from(s.html.matchAll(/data-cite=["']([\w-]+)["']/g), (m) => m[1]),
      ),
    );
    return project.citations.filter((c) => ids.has(c.id));
  }
  function usedSources(project) {
    const ids = new Set(usedCitations(project).map((c) => c.sourceId));
    return project.sources.filter((s) => ids.has(s.id));
  }
  const api = {
    types,
    labels,
    uid,
    escape,
    normalize,
    create,
    verifyCitation,
    reference,
    usedCitations,
    usedSources,
  };
  if (typeof module !== "undefined") module.exports = api;
  root.MonofyCore = api;
})(typeof window === "undefined" ? globalThis : window);
