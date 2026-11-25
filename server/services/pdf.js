const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// One generic "report with a table" builder, used by every PDF in the app.
// Instead of three 200-line functions that each draw their own table, every
// report just describes its title, summary boxes, columns and rows.

const FONT_DIR = path.join(__dirname, '../../public/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'AnekTamil-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'AnekTamil-SemiBold.ttf');
const hasTamilFont = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

const COLORS = { ink: '#2a1d14', muted: '#7a6a5d', brand: '#2b54a0', line: '#e6dcd2', zebra: '#faf6f1', bad: '#b3261e', good: '#1f7a3f' };

const inr = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} spec.subtitle
 * @param {Array<[string,string,('good'|'bad')?]>} spec.summary  label/value boxes
 * @param {Array<{label:string,width:number,align?:string}>} spec.columns  widths are fractions (sum 1)
 * @param {Array<Array<string|{text:string,color?:string}>>} spec.rows
 * @param {Array<string>} [spec.totalRow]
 * @returns {Promise<Buffer>}
 */
function buildReportPdf(spec) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (hasTamilFont) {
      doc.registerFont('body', FONT_REGULAR);
      doc.registerFont('bold', FONT_BOLD);
    }
    const body = hasTamilFont ? 'body' : 'Helvetica';
    const bold = hasTamilFont ? 'bold' : 'Helvetica-Bold';
    // Without the Tamil font, Helvetica cannot draw Tamil letters, so strip them.
    const clean = (s) => (hasTamilFont ? String(s ?? '') : String(s ?? '').replace(/[^\x20-\x7E₹]/g, '').replace('₹', 'Rs.'));

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    // Header
    doc.font(bold).fontSize(18).fillColor(COLORS.brand).text('Chendurar Sweets & Bakery', left, 36);
    doc.font(bold).fontSize(13).fillColor(COLORS.ink).text(clean(spec.title));
    doc.font(body).fontSize(10).fillColor(COLORS.muted).text(clean(spec.subtitle));
    doc.moveDown(0.8);

    // Summary boxes, up to 4 per row
    const perRow = 4;
    const gap = 8;
    const boxW = (width - gap * (perRow - 1)) / perRow;
    (spec.summary || []).forEach(([label, value, tone], i) => {
      if (i % perRow === 0 && i > 0) doc.y += 52;
      const x = left + (i % perRow) * (boxW + gap);
      const y = doc.y;
      doc.roundedRect(x, y, boxW, 44, 4).fillAndStroke(COLORS.zebra, COLORS.line);
      doc.font(body).fontSize(8).fillColor(COLORS.muted).text(clean(label).toUpperCase(), x + 8, y + 7, { width: boxW - 16 });
      doc.font(bold).fontSize(12).fillColor(tone ? COLORS[tone] : COLORS.ink).text(clean(value), x + 8, y + 21, { width: boxW - 16 });
      doc.y = y;
    });
    if ((spec.summary || []).length) doc.y += 60;

    // Table
    const cols = spec.columns.map((c) => ({ ...c, w: c.width * width }));
    const rowH = 20;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, width, rowH).fill(COLORS.brand);
      let x = left;
      cols.forEach((c) => {
        doc.font(bold).fontSize(8.5).fillColor('#fff').text(c.label, x + 5, y + 6, { width: c.w - 10, align: c.align || 'left' });
        x += c.w;
      });
      doc.y = y + rowH;
    };

    const drawRow = (cells, i, isTotal) => {
      if (doc.y + rowH > bottom()) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawHeader();
      }
      const y = doc.y;
      if (isTotal) doc.rect(left, y, width, rowH).fill(COLORS.line);
      else if (i % 2) doc.rect(left, y, width, rowH).fill(COLORS.zebra);
      let x = left;
      cells.forEach((cell, ci) => {
        const c = cols[ci];
        const text = typeof cell === 'object' && cell !== null ? cell.text : cell;
        const color = typeof cell === 'object' && cell !== null && cell.color ? COLORS[cell.color] : COLORS.ink;
        doc.font(isTotal ? bold : body).fontSize(8.5).fillColor(color)
          .text(clean(text), x + 5, y + 6, { width: c.w - 10, align: c.align || 'left', lineBreak: false, ellipsis: true });
        x += c.w;
      });
      doc.y = y + rowH;
    };

    drawHeader();
    if (!spec.rows.length) {
      doc.font(body).fontSize(10).fillColor(COLORS.muted).text('No records in this period.', left, doc.y + 10);
    }
    spec.rows.forEach((r, i) => drawRow(r, i, false));
    if (spec.totalRow) drawRow(spec.totalRow, 0, true);

    // Footer with page numbers on every page
    const range = doc.bufferedPageRange();
    const generated = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      doc.page.margins.bottom = 0; // let us write inside the bottom margin
      doc.font(body).fontSize(8).fillColor(COLORS.muted).text(
        `Generated ${generated}  ·  Page ${p + 1} of ${range.count}`,
        left, doc.page.height - 30, { width, align: 'center', lineBreak: false }
      );
    }
    doc.end();
  });
}

module.exports = { buildReportPdf, inr, dmy };
