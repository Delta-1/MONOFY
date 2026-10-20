/* Export the same semantic model used by the academic editor. */
(function () {
  "use strict";
  const C = MonofyCore;
  const twip = (cm) => Math.round((cm * 1440) / 2.54);
  const bytes = (data) =>
    Uint8Array.from(atob(data.split(",")[1]), (c) => c.charCodeAt(0));
  const text = (node) => node.textContent || "";
  function cssPt(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? (/px$/.test(v) ? n * 0.75 : n) : null;
  }
  function color(value) {
    if (!value) return;
    const el = document.createElement("span");
    el.style.color = value;
    document.body.append(el);
    const rgb = getComputedStyle(el).color;
    el.remove();
    const values = rgb.match(/\d+/g);
    return values?.length >= 3
      ? values
          .slice(0, 3)
          .map((n) => (+n).toString(16).padStart(2, "0"))
          .join("")
      : undefined;
  }
  async function imageRun(img, maxWidth) {
    const src = img.getAttribute("src");
    if (!src?.startsWith("data:image/"))
      throw new Error(
        "Uma imagem não está incorporada. Cole ou envie novamente antes de exportar.",
      );
    const picture = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Imagem inválida no documento."));
      i.src = src;
    });
    const width = Math.min(maxWidth, picture.naturalWidth),
      height = (picture.naturalHeight * width) / picture.naturalWidth;
    let data = src;
    if (!/^data:image\/(png|jpeg);/i.test(src)) {
      const c = document.createElement("canvas");
      c.width = picture.naturalWidth;
      c.height = picture.naturalHeight;
      c.getContext("2d").drawImage(picture, 0, 0);
      data = c.toDataURL("image/png");
    }
    return new docx.ImageRun({
      data: bytes(data),
      type: /^data:image\/jpeg/i.test(data) ? "jpg" : "png",
      transformation: { width: Math.round(width), height: Math.round(height) },
    });
  }
  async function build(project, options = {}) {
    if (!window.docx)
      throw new Error(
        "O gerador Word não carregou. Conecte-se e tente novamente.",
      );
    const D = docx,
      f = project.format,
      line = Math.round(f.line * 240),
      font = f.font,
      size = f.size * 2;
    const width = twip(f.paper === "letter" ? 21.59 : 21),
      height = twip(f.paper === "letter" ? 27.94 : 29.7),
      usable = (width - twip(f.margins[1] + f.margins[3])) / 15;
    const page = {
      size: { width, height },
      margin: {
        top: twip(f.margins[0]),
        right: twip(f.margins[1]),
        bottom: twip(f.margins[2]),
        left: twip(f.margins[3]),
      },
    };
    const footnotes = {},
      footIds = new Map();
    let footIndex = 1;
    const numbering = [];
    const runBase = { font, size };
    async function inline(node, opts = {}) {
      const out = [];
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          if (child.textContent)
            out.push(
              new D.TextRun({ ...runBase, ...opts, text: child.textContent }),
            );
          continue;
        }
        if (child.nodeType !== 1) continue;
        const tag = child.tagName.toLowerCase(),
          o = { ...opts };
        if (
          ["b", "strong"].includes(tag) ||
          /bold|[6-9]00/.test(child.style.fontWeight)
        )
          o.bold = true;
        if (["i", "em"].includes(tag) || child.style.fontStyle === "italic")
          o.italics = true;
        if (tag === "u" || child.style.textDecoration.includes("underline"))
          o.underline = { type: D.UnderlineType.SINGLE };
        if (["s", "del", "strike"].includes(tag)) o.strike = true;
        if (tag === "sup") o.superScript = true;
        if (tag === "sub") o.subScript = true;
        if (child.style.fontSize) o.size = cssPt(child.style.fontSize) * 2;
        if (child.style.fontFamily)
          o.font = child.style.fontFamily.split(",")[0].replace(/["']/g, "");
        if (child.style.color) o.color = color(child.style.color);
        if (child.style.backgroundColor)
          o.shading = { fill: color(child.style.backgroundColor) };
        if (tag === "br") {
          out.push(new D.TextRun({ ...runBase, ...o, break: 1 }));
          continue;
        }
        if (tag === "img") {
          out.push(await imageRun(child, usable));
          continue;
        }
        if (tag === "a" && child.dataset.cite) {
          const c = project.citations.find((c) => c.id === child.dataset.cite),
            s = project.sources.find((s) => s.id === c?.sourceId);
          out.push(...(await inline(child, o)));
          if (
            c &&
            s &&
            C.verifyCitation(project, c.sourceId, c.page, c.quote)
          ) {
            if (!footIds.has(c.id)) {
              const id = footIndex++;
              footIds.set(c.id, id);
              footnotes[id] = {
                children: [
                  new D.Paragraph({
                    children: [
                      new D.TextRun({
                        text: `${C.reference(s, project.norm, project.language)} ${project.language === "en" ? "File page" : project.language === "es" ? "Página del archivo" : "Página do arquivo"} ${c.page}. “${c.quote}”`,
                        font,
                        size: 20,
                      }),
                    ],
                  }),
                ],
              };
            }
            out.push(new D.FootnoteReferenceRun(footIds.get(c.id)));
          }
        } else if (
          tag === "a" &&
          /^https?:\/\//i.test(child.getAttribute("href") || "")
        )
          out.push(
            new D.ExternalHyperlink({
              link: child.href,
              children: await inline(child, {
                ...o,
                color: "276B55",
                underline: { type: D.UnderlineType.SINGLE },
              }),
            }),
          );
        else out.push(...(await inline(child, o)));
      }
      return out;
    }
    async function blocks(node, level = 0) {
      const out = [];
      for (const el of node.childNodes) {
        if (el.nodeType === 3) {
          if (el.textContent.trim())
            out.push(
              new D.Paragraph({
                children: [new D.TextRun({ ...runBase, text: el.textContent })],
              }),
            );
          continue;
        }
        if (el.nodeType !== 1) continue;
        const tag = el.tagName.toLowerCase();
        if (tag === "p" || tag === "blockquote" || tag === "figcaption") {
          const quote = tag === "blockquote",
            caption = tag === "figcaption";
          const alignment =
            {
              left: D.AlignmentType.LEFT,
              center: D.AlignmentType.CENTER,
              right: D.AlignmentType.RIGHT,
              justify: D.AlignmentType.JUSTIFIED,
            }[el.style.textAlign] ||
            (caption ? D.AlignmentType.CENTER : D.AlignmentType.JUSTIFIED);
          const customLine = parseFloat(el.style.lineHeight);
          out.push(
            new D.Paragraph({
              children: await inline(el, quote || caption ? { size: 20 } : {}),
              alignment,
              widowControl: true,
              spacing: {
                after: 120,
                line: quote
                  ? 240
                  : Number.isFinite(customLine)
                    ? Math.round(customLine * 240)
                    : line,
                lineRule: D.LineRuleType.AUTO,
              },
              indent: quote
                ? { left: twip(4) }
                : caption
                  ? undefined
                  : {
                      firstLine:
                        alignment === D.AlignmentType.JUSTIFIED
                          ? twip(f.indent)
                          : 0,
                    },
            }),
          );
        } else if (/^h[1-4]$/.test(tag))
          out.push(
            new D.Paragraph({
              children: await inline(el, { bold: true }),
              heading: D.HeadingLevel["HEADING_" + tag[1]],
              keepNext: true,
              keepLines: true,
              spacing: { before: 240, after: 160 },
            }),
          );
        else if (tag === "ul" || tag === "ol") {
          const ref = C.uid(),
            ordered = tag === "ol";
          numbering.push({
            reference: ref,
            levels: Array.from({ length: 9 }, (_, i) => ({
              level: i,
              format: ordered ? D.LevelFormat.DECIMAL : D.LevelFormat.BULLET,
              text: ordered ? "%" + (i + 1) + "." : "•",
              alignment: D.AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } },
              },
            })),
          });
          for (const li of el.children) {
            if (li.tagName !== "LI") continue;
            const clone = li.cloneNode(true);
            clone.querySelectorAll("ul,ol").forEach((n) => n.remove());
            out.push(
              new D.Paragraph({
                children: await inline(clone),
                numbering: { reference: ref, level: Math.min(level, 8) },
                spacing: { line, after: 80 },
              }),
            );
            for (const nested of li.children)
              if (["UL", "OL"].includes(nested.tagName)) {
                const wrapper = document.createElement("div");
                wrapper.append(nested.cloneNode(true));
                out.push(...(await blocks(wrapper, level + 1)));
              }
          }
        } else if (tag === "table") {
          const rows = [];
          for (const tr of el.querySelectorAll(
            ":scope > tbody > tr, :scope > thead > tr, :scope > tr",
          )) {
            const cells = [];
            for (const cell of tr.children) {
              const children = await blocks(cell);
              cells.push(
                new D.TableCell({
                  columnSpan: Math.max(
                    1,
                    Number(cell.getAttribute("colspan")) || 1,
                  ),
                  rowSpan: Math.max(
                    1,
                    Number(cell.getAttribute("rowspan")) || 1,
                  ),
                  children: children.length
                    ? children
                    : [
                        new D.Paragraph({
                          children: await inline(cell, {
                            size: 20,
                            bold: cell.tagName === "TH",
                          }),
                        }),
                      ],
                  margins: { top: 80, bottom: 80, left: 100, right: 100 },
                }),
              );
            }
            if (cells.length)
              rows.push(
                new D.TableRow({
                  children: cells,
                  tableHeader: tr.parentElement.tagName === "THEAD",
                  cantSplit: true,
                }),
              );
          }
          if (rows.length)
            out.push(
              new D.Table({
                rows,
                width: { size: 100, type: D.WidthType.PERCENTAGE },
              }),
            );
        } else if (tag === "img")
          out.push(
            new D.Paragraph({
              children: [await imageRun(el, usable)],
              alignment: D.AlignmentType.CENTER,
              spacing: { before: 160, after: 160 },
            }),
          );
        else if (tag === "div" || tag === "figure" || tag === "section") {
          const hasBlocks = el.querySelector(
            "p,div,h1,h2,h3,table,ul,ol,figure,img,figcaption",
          );
          if (hasBlocks) out.push(...(await blocks(el, level)));
          else
            out.push(
              new D.Paragraph({
                children: await inline(el),
                spacing: { line, after: 120 },
                indent: { firstLine: twip(f.indent) },
              }),
            );
        } else
          out.push(
            new D.Paragraph({
              children: await inline(el),
              spacing: { line, after: 120 },
            }),
          );
      }
      return out;
    }
    const cover = [];
    // Cover geometry follows the physical page, with the same flex spacing as preview.
    const contentHeight = (height - twip(f.margins[0] + f.margins[2])) / 20;
    const coverFontPt = f.size;
    const blockHeight = (b) =>
      b.kind === "image"
        ? 120
        : Math.max(
            22,
            (b.kind === "title" ? 16 : coverFontPt) *
              1.5 *
              String(b.text || "").split("\n").length,
          ) + 8;
    const blockGap = 16;
    const fixedHeight =
      project.cover.reduce(
        (sum, b) => sum + blockHeight(b) + (b.kind === "title" ? 85 : 0),
        0,
      ) +
      Math.max(0, project.cover.length - 1) * blockGap;
    const footerGap = Math.max(0, contentHeight - fixedHeight);
    for (const [coverIndex, b] of project.cover.entries()) {
      if (b.kind === "image") {
        const img = document.createElement("img");
        img.src = b.src;
        cover.push(
          new D.Paragraph({
            children: [await imageRun(img, 180)],
            alignment: D.AlignmentType.CENTER,
            spacing: { before: coverIndex ? 320 : 0, after: 0, line: 288 },
          }),
        );
        continue;
      }
      const opts = {
        font,
        size: b.kind === "title" ? 32 : size,
        bold: ["institution", "title"].includes(b.kind),
      };
      const runs = String(b.text || "")
        .split("\n")
        .flatMap((t, i) => [
          ...(i ? [new D.TextRun({ break: 1 })] : []),
          new D.TextRun({ ...opts, text: t }),
        ]);
      cover.push(
        new D.Paragraph({
          children: runs,
          alignment: D.AlignmentType.CENTER,
          keepLines: true,
          spacing: {
            before: Math.round(
              (coverIndex ? blockGap : 0) * 20 +
                (b.kind === "title" ? 1134 : 0) +
                (b.kind === "location" ? footerGap * 20 : 0),
            ),
            after: b.kind === "title" ? 567 : 0,
            line: Math.round(
              (b.kind === "title" ? 16 : coverFontPt) * 1.5 * 20,
            ),
            lineRule: D.LineRuleType.EXACT,
          },
        }),
      );
    }
    const body = [];
    if (options.toc) {
      body.push(
        new D.Paragraph({
          text: C.labels[project.language].contents,
          heading: D.HeadingLevel.HEADING_1,
        }),
      );
      body.push(
        new D.TableOfContents(C.labels[project.language].contents, {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),
      );
    }
    if (project.type.endsWith("map")) {
      body.push(
        new D.Paragraph({
          text: project.title,
          heading: D.HeadingLevel.HEADING_1,
          pageBreakBefore: !!options.toc,
        }),
      );
      const data = await mapImage(project);
      const img = document.createElement("img");
      img.src = data;
      body.push(
        new D.Paragraph({
          children: [await imageRun(img, usable)],
          alignment: D.AlignmentType.CENTER,
        }),
      );
    }
    for (const [i, s] of project.sections.entries()) {
      body.push(
        new D.Paragraph({
          children: [new D.TextRun({ ...runBase, bold: true, text: s.title })],
          heading: D.HeadingLevel.HEADING_1,
          pageBreakBefore:
            i > 0 || !!options.toc || project.type.endsWith("map"),
          alignment: D.AlignmentType.CENTER,
          keepNext: true,
          spacing: { after: 240 },
        }),
      );
      const wrapper = document.createElement("div");
      wrapper.innerHTML = s.html;
      body.push(...(await blocks(wrapper)));
    }
    const used = C.usedSources(project);
    if (used.length) {
      body.push(
        new D.Paragraph({
          text: C.labels[project.language].references,
          heading: D.HeadingLevel.HEADING_1,
          pageBreakBefore: true,
        }),
      );
      for (const s of used)
        body.push(
          new D.Paragraph({
            children: [
              new D.TextRun({
                ...runBase,
                text: C.reference(s, project.norm, project.language),
              }),
            ],
            indent: { left: twip(1.25), hanging: twip(1.25) },
            spacing: { line, after: 160 },
          }),
        );
    }
    const doc = new D.Document({
      title: project.title,
      creator: "Monofy",
      description: C.labels[project.language][project.type],
      features: { updateFields: true },
      styles: {
        default: {
          document: {
            run: { font, size },
            paragraph: { spacing: { line, after: 120 }, widowControl: true },
          },
        },
        paragraphStyles: [
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { font, size, bold: true, color: "000000" },
            paragraph: { keepNext: true },
          },
          {
            id: "Heading2",
            name: "Heading 2",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { font, size, bold: true, color: "000000" },
            paragraph: { keepNext: true },
          },
          {
            id: "Heading3",
            name: "Heading 3",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { font, size, bold: true, color: "000000" },
            paragraph: { keepNext: true },
          },
        ],
      },
      numbering: { config: numbering },
      footnotes,
      sections: [
        {
          properties: { page },
          children: cover.length ? cover : [new D.Paragraph("")],
        },
        {
          properties: { page: { ...page, pageNumbers: { start: 1 } } },
          headers: {
            default: new D.Header({
              children: [
                new D.Paragraph({
                  alignment: D.AlignmentType.RIGHT,
                  children: [
                    new D.TextRun({
                      children: [D.PageNumber.CURRENT],
                      font,
                      size,
                    }),
                  ],
                }),
              ],
            }),
          },
          children: body.length ? body : [new D.Paragraph("")],
        },
      ],
    });
    return D.Packer.toBlob(doc);
  }
  function wrap(ctx, value, width) {
    const lines = [];
    for (const para of String(value).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? line + " " + word : word;
        if (ctx.measureText(next).width > width && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }
  async function mapImage(project) {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 940;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 640, 470);
    ctx.font = "11px Arial";
    for (const e of project.map.edges) {
      const a = project.map.nodes.find((n) => n.id === e.from),
        b = project.map.nodes.find((n) => n.id === e.to);
      if (!a || !b) continue;
      ctx.strokeStyle = "#7c9b88";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x + 90, a.y + 32);
      ctx.lineTo(b.x + 90, b.y + 32);
      ctx.stroke();
      ctx.fillStyle = "#42624e";
      ctx.textAlign = "center";
      ctx.fillText(e.label || "", (a.x + b.x) / 2 + 90, (a.y + b.y) / 2 + 22);
    }
    project.map.nodes.forEach((n, i) => {
      ctx.fillStyle = i === 0 ? "#276b55" : "#f2f7f1";
      ctx.strokeStyle = "#b4ccbf";
      ctx.beginPath();
      ctx.roundRect(n.x, n.y, 180, 65, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = i === 0 ? "white" : "#224333";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      const lines = wrap(ctx, n.text, 155).slice(0, 4);
      lines.forEach((line, j) =>
        ctx.fillText(
          line,
          n.x + 90,
          n.y + 32 + (j - (lines.length - 1) / 2) * 13,
        ),
      );
    });
    return canvas.toDataURL("image/png");
  }
  window.MonofyExport = { build, mapImage };
})();
