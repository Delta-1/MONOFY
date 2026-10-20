const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const C = require("../academic-core.js");
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timed out waiting for workspace state");
}
async function setup(seed = []) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      runScripts: "outside-only",
      pretendToBeVisual: true,
      url: "https://monofy.test/",
    }),
    w = dom.window;
  w.MonofyCore = C;
  w.indexedDB = new IDBFactory();
  w.structuredClone = structuredClone;
  w.matchMedia = () => ({ matches: false });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(w.HTMLElement.prototype, "innerText", {
    get() {
      return this.textContent;
    },
    set(v) {
      this.textContent = v;
    },
    configurable: true,
  });
  await new Promise((resolve, reject) => {
    const req = w.indexedDB.open("monofy-academic", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("projects", { keyPath: "id" });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("projects", "readwrite");
      for (const p of seed) tx.objectStore("projects").put(p);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
  w.eval(fs.readFileSync(require.resolve("../academic.js"), "utf8"));
  await until(() => w.document.querySelector("#academic .home .grid"));
  const click = (action, extra = "") => {
    const el = w.document.querySelector(
      `#academic [data-action="${action}"]${extra}`,
    );
    assert.ok(el, `missing ${action}${extra}`);
    el.click();
  };
  const open = async (id) => {
    click("open", `[data-id="${id}"]`);
    await until(
      () =>
        w.MonofyAcademic.getProject()?.id === id &&
        w.document.querySelector("#academic-pages"),
    );
  };
  return { dom, w, click, open };
}
function withSource() {
  const p = C.create("research", "es", "Teste de fontes");
  p.sections = [
    {
      id: "section-test",
      title: "Introducción",
      html: "<p>Texto manual existente.</p>",
    },
  ];
  p.sources = [
    {
      id: "source-test",
      kind: "txt",
      name: "fonte.txt",
      title: "Fonte de teste",
      author: "Autor",
      year: "2024",
      pages: [
        {
          number: 1,
          text: "Cada cita debe apuntar al archivo y a la pagina de origen.",
        },
      ],
    },
  ];
  return p;
}
test("pasted HTML removes executable content, external images and unsafe attributes", async () => {
  const a = await setup();
  try {
    const html = a.w.MonofyAcademic.sanitize(
      '<script>alert(1)</script><p onclick="evil()"><b>Texto</b><a href="javascript:evil()">ruim</a><img src="https://tracker.test/a.png" onerror="evil()"></p><table><tr><td colspan="2">A</td></tr></table>',
    );
    assert.doesNotMatch(html, /script|onclick|onerror|tracker|javascript/);
    assert.match(html, /<b>Texto<\/b>/);
    assert.match(html, /colspan="2"/);
  } finally {
    a.dom.window.close();
  }
});
test("saving an older project never overwrites the most recent project", async () => {
  const p = C.create("blank", "pt", "Primeiro"),
    q = C.create("blank", "pt", "Segundo");
  const a = await setup([p, q]);
  try {
    await a.open(p.id);
    const input = a.w.document.querySelector("[data-section-edit]");
    input.innerHTML = "<p>Texto alterado do primeiro.</p>";
    input.dispatchEvent(new a.w.Event("input", { bubbles: true }));
    await a.w.MonofyAcademic.save();
    a.click("home");
    await until(() => !a.w.MonofyAcademic.getProject());
    await a.open(q.id);
    assert.doesNotMatch(
      a.w.MonofyAcademic.getProject().sections[0].html,
      /alterado/,
    );
    const saved = a.w.MonofyAcademic.getProjects().find((d) => d.id === p.id);
    assert.match(saved.sections[0].html, /Texto alterado/);
  } finally {
    a.dom.window.close();
  }
});
test("AI waits for conversational language selection and only links verified evidence", async () => {
  const p = withSource(),
    a = await setup([p]);
  try {
    let calls = 0;
    const prompts = [];
    a.w.localStorage.setItem("monofy_gemini_api_key", "test-only-placeholder");
    a.w.fetch = async (url, options) => {
      calls++;
      assert.match(url, /generativelanguage.googleapis.com/);
      assert.equal(options.headers["x-goog-api-key"], "test-only-placeholder");
      prompts.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Introducción",
                      paragraphs: [
                        {
                          text: "Con evidencia.",
                          citations: [
                            {
                              sourceId: "source-test",
                              page: 1,
                              quote:
                                "Cada cita debe apuntar al archivo y a la pagina de origen.",
                            },
                          ],
                        },
                        {
                          text: "Sin evidencia.",
                          citations: [
                            {
                              sourceId: "source-test",
                              page: 1,
                              quote:
                                "Frase inventada que no está en el material.",
                            },
                          ],
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    };
    await a.open(p.id);
    a.click("tab", '[data-tab="ai"]');
    a.click("ai-generate");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 0);
    a.click("confirm-language", '[data-language="es"]');
    a.click("ai-generate");
    await until(() =>
      a.w.document
        .querySelector("#academic-chat")
        ?.textContent.includes("Rascunho adicionado"),
    );
    const result = a.w.MonofyAcademic.getProject();
    assert.equal(calls, 1);
    assert.match(prompts[0].contents[0].parts[0].text, /Escreva em Español/);
    assert.equal(result.citations.length, 1);
    assert.match(result.sections[0].html, /Texto manual existente/);
    assert.match(result.sections[0].html, /data-cite=/);
    assert.match(result.sections[0].html, /Revisar fonte/);
    assert.equal(result.sources.length, 1);
  } finally {
    a.dom.window.close();
  }
});
test("backup validation rejects malformed geometry and unsafe IDs", async () => {
  const a = await setup();
  try {
    const p = C.create();
    p.sections[0].id = 'bad" onclick="evil';
    assert.throws(() => a.w.MonofyAcademic.validateProject(p), /Identificador/);
    const q = C.create();
    q.format.margins = [-100, 0, 2, 3];
    assert.throws(() => a.w.MonofyAcademic.validateProject(q), /Margens/);
  } finally {
    a.dom.window.close();
  }
});
test("removing a citation removes its source from the generated bibliography", () => {
  const p = withSource();
  p.citations = [
    {
      id: "c1",
      sourceId: "source-test",
      page: 1,
      quote: p.sources[0].pages[0].text,
    },
  ];
  p.sections[0].html = '<p><a data-cite="c1">(Autor, 2024)</a></p>';
  assert.equal(C.usedSources(p).length, 1);
  p.sections[0].html = "<p>Sem citação.</p>";
  assert.equal(C.usedSources(p).length, 0);
});
