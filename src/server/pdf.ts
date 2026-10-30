import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";

// US Letter, 0.6in side margins: prints on any home printer without clipping.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 43;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const TOP = PAGE_H - 58; // first content line, below the running header
const BOTTOM = 56; // last content line, above the running footer

// Greys only, so the report reads the same on a black-and-white printer.
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.35, 0.35, 0.35);
const RULE = rgb(0.72, 0.72, 0.72);
const SHADE = rgb(0.92, 0.92, 0.92);

/** Helvetica only supports WinAnsi; replace anything else so rendering never throws. */
export function sanitize(text: string): string {
  return text.replace(/[\r\t]/g, " ").replace(/[^\n\x20-\x7e -ÿ]/g, "?");
}

type TextOpts = { size?: number; bold?: boolean; muted?: boolean; indent?: number };
export type Column = { title: string; width: number };
export type Cell = string | { text: string; shade?: boolean; bold?: boolean; muted?: boolean };
export type GridPhoto = { data: Buffer; mime: string; caption: string };

export class PdfWriter {
  private page!: PDFPage;
  private y = TOP;
  /** Re-run on every page break inside a table so its heading row repeats. */
  private onBreak: (() => void) | null = null;

  private constructor(
    public doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private header: { title: string; right: string },
  ) {}

  static async create(header: { title: string; right: string }) {
    const doc = await PDFDocument.create();
    const w = new PdfWriter(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), header);
    w.newPage();
    return w;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = TOP;
  }

  /** Starts a new page when `h` points do not fit; returns true if it did. */
  private ensure(h: number) {
    if (this.y - h >= BOTTOM) return false;
    this.newPage();
    this.onBreak?.();
    return true;
  }

  gap(h = 8) {
    this.y -= h;
  }

  private f(bold?: boolean) {
    return bold ? this.bold : this.font;
  }

  private wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    for (const para of sanitize(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= maxW) line = test;
        else {
          if (line) out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }

  private draw(text: string, x: number, y: number, size: number, opts: { bold?: boolean; muted?: boolean } = {}) {
    this.page.drawText(sanitize(text), { x, y, size, font: this.f(opts.bold), color: opts.muted ? MUTED : INK });
  }

  private rect(x: number, y: number, w: number, h: number, opts: { fill?: boolean; border?: "ink" | "rule"; borderWidth?: number }) {
    this.page.drawRectangle({
      x, y, width: w, height: h,
      color: opts.fill ? SHADE : undefined,
      borderColor: opts.border ? (opts.border === "ink" ? INK : RULE) : undefined,
      borderWidth: opts.border ? (opts.borderWidth ?? 0.6) : 0,
    });
  }

  text(text: string, opts: TextOpts = {}) {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lh = size * 1.35;
    for (const line of this.wrap(text, this.f(opts.bold), size, CONTENT_W - indent)) {
      this.ensure(lh);
      this.draw(line, MARGIN + indent, this.y - size, size, opts);
      this.y -= lh;
    }
  }

  title(text: string, sub: string) {
    this.gap(6);
    this.text(text, { size: 22, bold: true });
    this.gap(2);
    this.text(sub, { size: 10, muted: true });
    this.gap(12);
  }

  /** Two-column boxed list of label/value pairs. */
  facts(pairs: [string, string][]) {
    const colW = CONTENT_W / 2;
    const rowH = 30;
    const rows = Math.ceil(pairs.length / 2);
    this.ensure(rows * rowH);
    const top = this.y;
    pairs.forEach(([k, v], i) => {
      const x = MARGIN + (i % 2) * colW;
      const y = top - Math.floor(i / 2) * rowH;
      this.rect(x, y - rowH, colW, rowH, { border: "rule" });
      this.draw(k.toUpperCase(), x + 8, y - 11, 7, { muted: true });
      this.draw(this.wrap(v || "-", this.font, 10, colW - 16)[0], x + 8, y - 24, 10);
    });
    this.rect(MARGIN, top - rows * rowH, CONTENT_W, rows * rowH, { border: "ink", borderWidth: 1 });
    this.y = top - rows * rowH - 12;
  }

  /** Row of boxed figures, e.g. "17 rooms". */
  stats(items: [string | number, string][]) {
    const gap = 8;
    const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
    const h = 40;
    this.ensure(h);
    items.forEach(([value, label], i) => {
      const x = MARGIN + i * (w + gap);
      this.rect(x, this.y - h, w, h, { border: "rule" });
      const v = String(value);
      this.draw(v, x + (w - this.bold.widthOfTextAtSize(v, 17)) / 2, this.y - 21, 17, { bold: true });
      this.draw(label, x + (w - this.font.widthOfTextAtSize(sanitize(label), 7.5)) / 2, this.y - 33, 7.5, { muted: true });
    });
    this.y -= h + 10;
  }

  /** Shaded bar that opens a room or section; `keep` reserves room for what must follow it. */
  sectionBar(left: string, right = "", keep = 110) {
    this.gap(10);
    const h = 22;
    this.ensure(h + keep);
    this.rect(MARGIN, this.y - h, CONTENT_W, h, { fill: true, border: "ink", borderWidth: 1 });
    this.draw(left, MARGIN + 8, this.y - 15, 12, { bold: true });
    if (right) this.draw(right, MARGIN + CONTENT_W - 8 - this.font.widthOfTextAtSize(sanitize(right), 9.5), this.y - 15, 9.5);
    this.y -= h;
  }

  /** Full-width bordered box of text, attached under a section bar. */
  noteBox(text: string, opts: { muted?: boolean } = {}) {
    const size = 9;
    const lines = this.wrap(text, this.font, size, CONTENT_W - 12);
    const h = lines.length * size * 1.35 + 10;
    this.ensure(h);
    this.rect(MARGIN, this.y - h, CONTENT_W, h, { border: "rule" });
    lines.forEach((l, i) => this.draw(l, MARGIN + 6, this.y - 5 - size - i * size * 1.35, size, opts));
    this.y -= h;
  }

  /**
   * Table with a repeating heading row. Rows never split across pages; empty cells keep
   * enough height to write in by hand.
   */
  table(columns: Column[], rows: Cell[][], opts: { continued?: string } = {}) {
    const size = 9;
    const lh = size * 1.3;
    const pad = 5;
    const widths = columns.map((c) => c.width * CONTENT_W);
    const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, b) => a + b, 0));

    const headRow = (afterBreak: boolean) => {
      if (afterBreak && opts.continued) {
        this.draw(`${opts.continued} (continued)`, MARGIN, this.y - 10, 9, { bold: true, muted: true });
        this.y -= 16;
      }
      const h = 16;
      columns.forEach((c, i) => {
        this.rect(xs[i], this.y - h, widths[i], h, { border: "ink" });
        this.draw(c.title.toUpperCase(), xs[i] + pad, this.y - 11, 7, { muted: true });
      });
      this.y -= h;
    };

    const cells = rows.map((r) =>
      r.map((c, i) => {
        const cell = typeof c === "string" ? { text: c } : c;
        return { ...cell, lines: cell.text ? this.wrap(cell.text, this.f(cell.bold), size, widths[i] - 2 * pad) : [] };
      }),
    );

    this.ensure(16 + (cells[0] ? Math.max(20, ...cells[0].map((c) => c.lines.length * lh + 2 * pad)) : 0));
    headRow(false);
    this.onBreak = () => headRow(true);
    for (const row of cells) {
      const h = Math.max(20, ...row.map((c) => c.lines.length * lh + 2 * pad));
      this.ensure(h);
      row.forEach((c, i) => {
        this.rect(xs[i], this.y - h, widths[i], h, { fill: c.shade, border: "rule" });
        c.lines.forEach((l, j) => this.draw(l, xs[i] + pad, this.y - pad - size - j * lh + 1.5, size, c));
      });
      this.y -= h;
    }
    this.onBreak = null;
  }

  /** Callout with a heavy left bar (used for blemishes / damage), readable without colour. */
  callout(label: string, text: string, extra = "") {
    const size = 9;
    const body = this.wrap(text, this.font, size, CONTENT_W - 16);
    const more = extra ? this.wrap(extra, this.font, 8, CONTENT_W - 16) : [];
    const h = 12 + body.length * size * 1.35 + more.length * 8 * 1.35 + 6;
    this.gap(5);
    this.ensure(h);
    this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: 3, height: h, color: INK });
    this.draw(label.toUpperCase(), MARGIN + 10, this.y - 9, 7.5, { bold: true });
    let y = this.y - 12;
    for (const l of body) { this.draw(l, MARGIN + 10, y - size, size); y -= size * 1.35; }
    for (const l of more) { this.draw(l, MARGIN + 10, y - 8, 8, { muted: true }); y -= 8 * 1.35; }
    this.y -= h;
  }

  private async embed(data: Buffer, mime: string): Promise<PDFImage | null> {
    try {
      return mime === "image/png" ? await this.doc.embedPng(data) : await this.doc.embedJpg(data);
    } catch {
      return null;
    }
  }

  /** Photos three across, each fitted into a 4:3 frame with a numbered caption under it. */
  async photoGrid(photos: GridPhoto[]) {
    const cols = 3;
    const gap = 10;
    const w = (CONTENT_W - gap * (cols - 1)) / cols;
    const boxH = w * 0.75;
    const capSize = 7.5;
    this.gap(10);
    for (let i = 0; i < photos.length; i += cols) {
      const row = photos.slice(i, i + cols);
      const caps = row.map((p) => this.wrap(p.caption, this.font, capSize, w).slice(0, 3));
      const h = boxH + 4 + Math.max(...caps.map((c) => c.length)) * capSize * 1.3 + 8;
      this.ensure(h);
      for (const [j, p] of row.entries()) {
        const x = MARGIN + j * (w + gap);
        const img = await this.embed(p.data, p.mime);
        if (img) {
          const s = Math.min(w / img.width, boxH / img.height);
          const iw = img.width * s, ih = img.height * s;
          this.page.drawImage(img, { x: x + (w - iw) / 2, y: this.y - boxH + (boxH - ih) / 2, width: iw, height: ih });
        } else {
          this.draw("[photo unavailable]", x + 6, this.y - boxH / 2, 8, { muted: true });
        }
        this.rect(x, this.y - boxH, w, boxH, { border: "rule" });
        caps[j].forEach((l, k) => this.draw(l, x, this.y - boxH - 4 - capSize - k * capSize * 1.3, capSize));
      }
      this.y -= h;
    }
  }

  /** Empty ruled box for handwritten comments. */
  writeBox(label: string, h: number) {
    this.ensure(h + 16);
    this.draw(label, MARGIN, this.y - 10, 10, { bold: true });
    this.y -= 15;
    this.rect(MARGIN, this.y - h, CONTENT_W, h, { border: "rule" });
    for (let ly = this.y - 22; ly > this.y - h + 6; ly -= 22) {
      this.page.drawLine({ start: { x: MARGIN + 8, y: ly }, end: { x: MARGIN + CONTENT_W - 8, y: ly }, thickness: 0.3, color: RULE });
    }
    this.y -= h + 8;
  }

  /** Signature / printed name / date lines; a captured signature image is drawn above its line. */
  async signatureLine(role: string, signed?: { image: Buffer; name: string; date: string }) {
    const h = 58;
    this.ensure(h);
    const cols = [0.5, 0.3, 0.2].map((f) => f * CONTENT_W);
    const lineY = this.y - h + 16;
    let x = MARGIN;
    const labels = [`${role} signature`, "Printed name", "Date"];
    for (const [i, cw] of cols.entries()) {
      const w = cw - 14;
      this.page.drawLine({ start: { x, y: lineY }, end: { x: x + w, y: lineY }, thickness: 0.8, color: INK });
      this.draw(labels[i], x, lineY - 10, 7.5, { muted: true });
      if (signed) {
        if (i === 0) {
          const img = await this.embed(signed.image, "image/png");
          if (img) {
            const s = Math.min(w / img.width, 34 / img.height);
            this.page.drawImage(img, { x, y: lineY + 2, width: img.width * s, height: img.height * s });
          }
        }
        if (i === 1) this.draw(signed.name, x, lineY + 4, 10);
        if (i === 2) this.draw(signed.date, x, lineY + 4, 10);
      }
      x += cw;
    }
    this.y -= h;
  }

  /** Draws the running header and footer (page X of Y, initials) on every page. */
  private finish() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      this.page = p;
      this.draw(this.header.title.toUpperCase(), MARGIN, PAGE_H - 34, 7.5, { muted: true });
      const r = sanitize(this.header.right);
      this.draw(r, PAGE_W - MARGIN - this.bold.widthOfTextAtSize(r, 9), PAGE_H - 34, 9, { bold: true });
      p.drawLine({ start: { x: MARGIN, y: PAGE_H - 40 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 40 }, thickness: 1.2, color: INK });

      p.drawLine({ start: { x: MARGIN, y: 42 }, end: { x: PAGE_W - MARGIN, y: 42 }, thickness: 0.5, color: RULE });
      this.draw("Tenant initials", MARGIN, 28, 8, { muted: true });
      p.drawLine({ start: { x: MARGIN + 62, y: 27 }, end: { x: MARGIN + 122, y: 27 }, thickness: 0.6, color: INK });
      this.draw("Landlord initials", MARGIN + 136, 28, 8, { muted: true });
      p.drawLine({ start: { x: MARGIN + 206, y: 27 }, end: { x: MARGIN + 266, y: 27 }, thickness: 0.6, color: INK });
      const num = `Page ${i + 1} of ${pages.length}`;
      this.draw(num, PAGE_W - MARGIN - this.font.widthOfTextAtSize(num, 8), 28, 8, { muted: true });
    });
  }

  async save(): Promise<Buffer> {
    this.finish();
    return Buffer.from(await this.doc.save());
  }
}
