import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;

/** Helvetica only supports WinAnsi; replace anything else so rendering never throws. */
export function sanitize(text: string): string {
  return text.replace(/[\r\t]/g, " ").replace(/[^\n\x20-\x7e -ÿ]/g, "?");
}

export class PdfWriter {
  private constructor(
    public doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private page: PDFPage,
    private y: number,
  ) {}

  static async create() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([PAGE_W, PAGE_H]);
    return new PdfWriter(doc, font, bold, page, PAGE_H - MARGIN);
  }

  private ensure(h: number) {
    if (this.y - h < MARGIN) {
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.y = PAGE_H - MARGIN;
    }
  }

  gap(h = 8) {
    this.y -= h;
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

  text(text: string, opts: { size?: number; bold?: boolean; indent?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    for (const line of this.wrap(text, font, size, PAGE_W - 2 * MARGIN - indent)) {
      this.ensure(size + 3);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - size,
        size,
        font,
        color: opts.color ? rgb(...opts.color) : rgb(0, 0, 0),
      });
      this.y -= size + 3;
    }
  }

  heading(text: string, size = 14) {
    this.gap(6);
    this.text(text, { size, bold: true });
    this.gap(2);
  }

  /** Embeds a PNG/JPEG scaled to fit; silently notes unsupported formats (e.g. WebP). */
  async image(data: Buffer, mime: string, opts: { maxW?: number; maxH?: number; indent?: number; label?: string } = {}) {
    const maxW = opts.maxW ?? 220;
    const maxH = opts.maxH ?? 165;
    let img;
    try {
      img = mime === "image/png" ? await this.doc.embedPng(data) : await this.doc.embedJpg(data);
    } catch {
      this.text(`[image not embeddable: ${opts.label ?? mime}]`, { size: 8, indent: opts.indent, color: [0.5, 0.5, 0.5] });
      return;
    }
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    this.ensure(h + 14);
    this.page.drawImage(img, { x: MARGIN + (opts.indent ?? 0), y: this.y - h, width: w, height: h });
    this.y -= h + 4;
    if (opts.label) this.text(opts.label, { size: 7, indent: opts.indent, color: [0.4, 0.4, 0.4] });
  }

  async save(): Promise<Buffer> {
    return Buffer.from(await this.doc.save());
  }
}
