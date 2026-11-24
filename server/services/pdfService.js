const PDFDocument = require('pdfkit');

/**
 * Format currency in Indian Rupees
 */
const formatINR = (val) => {
  const num = Number(val) || 0;
  return 'Rs. ' + num.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
};

/**
 * Format date string YYYY-MM-DD to DD-MM-YYYY
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

/**
 * Clean staff name to show ONLY the English name without any parenthetical Tamil script or unrenderable fonts
 * e.g. "Karthik (கார்த்திக்)" -> "Karthik"
 */
/**
 * Clean text to show ONLY clean English text without unrenderable Tamil characters in parentheses
 * e.g. "Karthik (கார்த்திக்)" -> "Karthik"
 * e.g. "Main Branch (தலைமை கிளை)" -> "Main Branch"
 */
const cleanText = (name) => {
  if (!name) return '';
  let cleaned = name.replace(/\s*\([^)]*[\u0B80-\u0BFF][^)]*\)/g, '').trim();
  cleaned = cleaned.replace(/[\u0B80-\u0BFF]/g, '').trim();
  cleaned = cleaned.replace(/[^\x20-\x7E]/g, '').trim();
  return cleaned || 'Main';
};

const cleanStaffName = (name) => {
  return cleanText(name) || 'Staff';
};

/**
 * Generate Sales History PDF
 * @param {Array} salesRecords - DailySales records in date range
 * @param {String} fromDate - YYYY-MM-DD
 * @param {String} toDate - YYYY-MM-DD
 * @param {Object} totals - Calculated totals
 * @param {String} branchName - Name of the branch
 * @returns {Promise<Buffer>}
 */
const generateSalesHistoryPDF = (salesRecords, fromDate, toDate, totals, branchName = 'Samayanallur Branch') => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const safeBranchName = cleanText(branchName) || 'Samayanallur Branch';

      // --- HEADER ---
      doc.rect(36, 36, 523, 70).fill('#78350F');

      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('Chendurar Sweets and Bakery - Sales History', 46, 46, { align: 'center', width: 503 });

      doc.font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#FDE68A')
        .text(`Branch: ${safeBranchName}`, 46, 66, { align: 'center', width: 503 });

      doc.font('Helvetica')
        .fontSize(9)
        .fillColor('#FEF3C7')
        .text(`Report Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 46, 80, { align: 'center', width: 503 });

      const generatedOn = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      doc.fontSize(7.5)
        .fillColor('#FDE68A')
        .text(`Generated on: ${generatedOn} | Owner Copy`, 46, 93, { align: 'center', width: 503 });

      doc.moveDown(2);

      // --- SUMMARY KPI BOXES ---
      let startY = 118;
      const boxWidth = 124;
      const boxHeight = 44;
      const gap = 9;

      const kpis = [
        { label: 'SYSTEM SALES', value: formatINR(totals.systemSales), color: '#1E293B', bg: '#F1F5F9' },
        { label: 'EXPENSES', value: formatINR(totals.expenses), color: '#BE123C', bg: '#FFE4E6' },
        { label: 'CASH COLLECTED', value: formatINR(totals.totalCash), color: '#047857', bg: '#D1FAE5' },
        { label: 'GPAY COLLECTED', value: formatINR(totals.totalGpay), color: '#1D4ED8', bg: '#DBEAFE' },
      ];

      kpis.forEach((kpi, idx) => {
        const x = 36 + idx * (boxWidth + gap);
        doc.rect(x, startY, boxWidth, boxHeight).fill(kpi.bg);
        doc.rect(x, startY, boxWidth, boxHeight).stroke('#CBD5E1');

        doc.fillColor('#64748B')
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(kpi.label, x + 6, startY + 8, { width: boxWidth - 12, align: 'center' });

        doc.fillColor(kpi.color)
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(kpi.value, x + 6, startY + 22, { width: boxWidth - 12, align: 'center' });
      });

      // Tally Status banner
      startY += boxHeight + 10;
      const diffColor = totals.difference === 0 ? '#047857' : (totals.difference > 0 ? '#D97706' : '#DC2626');
      const diffBg = totals.difference === 0 ? '#ECFDF5' : '#FFFBEB';
      doc.rect(36, startY, 523, 26).fill(diffBg);
      doc.rect(36, startY, 523, 26).stroke('#E2E8F0');

      const tallyStatusText = totals.difference === 0
        ? `TALLY STATUS: PERFECT MATCH (Rs. 0 difference) | ${totals.matchedDays} Days Matched`
        : `TALLY STATUS: MISMATCH of ${formatINR(totals.difference)} | ${totals.mismatchDays} Day(s) with Mismatch`;

      doc.fillColor(diffColor)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(tallyStatusText, 46, startY + 8, { width: 503, align: 'center' });

      // --- TABLE ---
      startY += 36;

      // Table Headers: Date, System Sales, Expenses, Total Cash, Total GPay, Tally Difference
      const cols = [
        { title: 'Date', x: 42, width: 75, align: 'left' },
        { title: 'System Sales', x: 120, width: 80, align: 'right' },
        { title: 'Expenses', x: 205, width: 75, align: 'right' },
        { title: 'Total Cash', x: 285, width: 80, align: 'right' },
        { title: 'Total GPay', x: 370, width: 80, align: 'right' },
        { title: 'Tally Difference', x: 455, width: 95, align: 'right' },
      ];

      // Draw table header
      doc.rect(36, startY, 523, 22).fill('#451A03');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);

      cols.forEach((col) => {
        doc.text(col.title, col.x, startY + 6, { width: col.width, align: col.align });
      });

      let currentY = startY + 22;

      if (!salesRecords || salesRecords.length === 0) {
        doc.rect(36, currentY, 523, 30).fill('#F8FAFC');
        doc.fillColor('#64748B').font('Helvetica').fontSize(9)
          .text('No sales records found for this period.', 46, currentY + 10, { align: 'center', width: 503 });
        currentY += 30;
      } else {
        salesRecords.forEach((record, index) => {
          // Check for page overflow
          if (currentY > 740) {
            doc.addPage();
            currentY = 40;
            // Redraw table header on new page
            doc.rect(36, currentY, 523, 22).fill('#451A03');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
            cols.forEach((col) => {
              doc.text(col.title, col.x, currentY + 6, { width: col.width, align: col.align });
            });
            currentY += 22;
          }

          const isTallied = record.isTallied;
          const diff = Math.round(((record.totalAccounted || 0) - (record.systemSales || 0)) * 100) / 100;
          const isMismatch = !isTallied || Math.abs(diff) > 0.01;

          // Row background
          const rowBg = isMismatch ? '#FEF2F2' : (index % 2 === 0 ? '#FFFFFF' : '#F9FAFB');
          doc.rect(36, currentY, 523, 20).fill(rowBg);
          doc.rect(36, currentY, 523, 20).stroke('#E5E7EB');

          doc.font('Helvetica').fontSize(8).fillColor('#1F2937');
          doc.text(formatDate(record.date), cols[0].x, currentY + 5, { width: cols[0].width, align: cols[0].align });
          doc.text(formatINR(record.systemSales), cols[1].x, currentY + 5, { width: cols[1].width, align: cols[1].align });
          doc.text(formatINR(record.totalExpenses), cols[2].x, currentY + 5, { width: cols[2].width, align: cols[2].align });
          doc.text(formatINR(record.totalCash), cols[3].x, currentY + 5, { width: cols[3].width, align: cols[3].align });
          doc.text(formatINR(record.totalGpay), cols[4].x, currentY + 5, { width: cols[4].width, align: cols[4].align });

          // Tally difference column
          if (isMismatch) {
            doc.font('Helvetica-Bold').fillColor('#DC2626');
            const diffSign = diff > 0 ? '+' : '';
            doc.text(`${diffSign}${formatINR(diff)} *`, cols[5].x, currentY + 5, { width: cols[5].width, align: cols[5].align });
          } else {
            doc.font('Helvetica-Bold').fillColor('#059669');
            doc.text('Matched (0)', cols[5].x, currentY + 5, { width: cols[5].width, align: cols[5].align });
          }

          currentY += 20;
        });
      }

      // --- TOTALS ROW ---
      if (currentY > 730) {
        doc.addPage();
        currentY = 40;
      }

      doc.rect(36, currentY, 523, 24).fill('#FEF3C7');
      doc.rect(36, currentY, 523, 24).stroke('#B45309');

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#92400E');
      doc.text('TOTALS', cols[0].x, currentY + 7, { width: cols[0].width, align: cols[0].align });
      doc.text(formatINR(totals.systemSales), cols[1].x, currentY + 7, { width: cols[1].width, align: cols[1].align });
      doc.text(formatINR(totals.expenses), cols[2].x, currentY + 7, { width: cols[2].width, align: cols[2].align });
      doc.text(formatINR(totals.totalCash), cols[3].x, currentY + 7, { width: cols[3].width, align: cols[3].align });
      doc.text(formatINR(totals.totalGpay), cols[4].x, currentY + 7, { width: cols[4].width, align: cols[4].align });

      const netDiff = totals.difference;
      const netSign = netDiff > 0 ? '+' : '';
      const netDiffColor = netDiff === 0 ? '#059669' : '#DC2626';
      doc.fillColor(netDiffColor);
      doc.text(netDiff === 0 ? 'Matched (0)' : `${netSign}${formatINR(netDiff)}`, cols[5].x, currentY + 7, { width: cols[5].width, align: cols[5].align });

      currentY += 32;

      // Note on mismatches
      if (totals.mismatchDays > 0) {
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#DC2626')
          .text(`* Indicates tally discrepancy between system sales and actual collections (cash + gpay + expenses).`, 36, currentY, { width: 523, align: 'left' });
      }

      // Finalize PDF
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Generate Attendance History PDF
 * @param {Array} attendanceItems - Flattened row items: { date, staffName, inTime, outTime, status }
 * @param {Array} staffSummaries - Array of { name, present, halfDay, absent, totalDays }
 * @param {String} fromDate - YYYY-MM-DD
 * @param {String} toDate - YYYY-MM-DD
 * @param {String} filterStaffName - Optional staff filter
 * @param {String} branchName - Name of the branch
 * @returns {Promise<Buffer>}
 */
const generateAttendanceHistoryPDF = (attendanceItems, staffSummaries, fromDate, toDate, filterStaffName = null, branchName = 'Samayanallur Branch') => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const safeBranchName = cleanText(branchName) || 'Samayanallur Branch';

      // --- HEADER ---
      doc.rect(36, 36, 523, 70).fill('#1E3A8A'); // Indigo / Navy

      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('Chendurar Sweets and Bakery - Attendance History', 46, 46, { align: 'center', width: 503 });

      const filterText = filterStaffName ? ` | Staff: ${cleanStaffName(filterStaffName)}` : ' | All Staff';
      doc.font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#93C5FD')
        .text(`Branch: ${safeBranchName}${filterText}`, 46, 66, { align: 'center', width: 503 });

      doc.font('Helvetica')
        .fontSize(9)
        .fillColor('#DBEAFE')
        .text(`Report Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`, 46, 80, { align: 'center', width: 503 });

      const generatedOn = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      doc.fontSize(7.5)
        .fillColor('#93C5FD')
        .text(`Generated on: ${generatedOn} | Owner Copy`, 46, 93, { align: 'center', width: 503 });

      // --- ATTENDANCE RECORDS TABLE ---
      let currentY = 118;

      // Table Headers: Date, Staff Name, In-Time, Out-Time, Status
      const cols = [
        { title: 'Date', x: 42, width: 85, align: 'left' },
        { title: 'Staff Name', x: 132, width: 140, align: 'left' },
        { title: 'In-Time', x: 280, width: 80, align: 'center' },
        { title: 'Out-Time', x: 365, width: 80, align: 'center' },
        { title: 'Status', x: 450, width: 100, align: 'center' },
      ];

      doc.rect(36, currentY, 523, 22).fill('#172554');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);

      cols.forEach((col) => {
        doc.text(col.title, col.x, currentY + 6, { width: col.width, align: col.align });
      });

      currentY += 22;

      if (!attendanceItems || attendanceItems.length === 0) {
        doc.rect(36, currentY, 523, 30).fill('#F8FAFC');
        doc.fillColor('#64748B').font('Helvetica').fontSize(9)
          .text('No attendance records found for this period.', 46, currentY + 10, { align: 'center', width: 503 });
        currentY += 30;
      } else {
        attendanceItems.forEach((item, index) => {
          if (currentY > 730) {
            doc.addPage();
            currentY = 40;
            doc.rect(36, currentY, 523, 22).fill('#172554');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
            cols.forEach((col) => {
              doc.text(col.title, col.x, currentY + 6, { width: col.width, align: col.align });
            });
            currentY += 22;
          }

          const status = item.status || 'Present';
          const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(36, currentY, 523, 19).fill(rowBg);
          doc.rect(36, currentY, 523, 19).stroke('#E2E8F0');

          doc.font('Helvetica').fontSize(8).fillColor('#1E293B');
          doc.text(formatDate(item.date), cols[0].x, currentY + 5, { width: cols[0].width, align: cols[0].align });
          doc.text(cleanStaffName(item.staffName), cols[1].x, currentY + 5, { width: cols[1].width, align: cols[1].align });
          doc.text(item.inTime || '-', cols[2].x, currentY + 5, { width: cols[2].width, align: cols[2].align });
          doc.text(item.outTime || '-', cols[3].x, currentY + 5, { width: cols[3].width, align: cols[3].align });

          // Status Badge
          let statusColor = '#059669'; // Present
          if (status === 'Half-day') statusColor = '#D97706';
          if (status === 'Absent') statusColor = '#DC2626';

          doc.font('Helvetica-Bold').fillColor(statusColor);
          doc.text(status, cols[4].x, currentY + 5, { width: cols[4].width, align: cols[4].align });

          currentY += 19;
        });
      }

      currentY += 16;

      // --- STAFF SUMMARY TABLE AT THE END ---
      // Check if enough room for summary table
      const estimatedSummaryHeight = 40 + (staffSummaries.length * 20);
      if (currentY + estimatedSummaryHeight > 750) {
        doc.addPage();
        currentY = 40;
      }

      doc.rect(36, currentY, 523, 22).fill('#312E81');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
        .text('STAFF ATTENDANCE SUMMARY (Total Days / Absences / Half-days)', 46, currentY + 6, { width: 503, align: 'left' });

      currentY += 22;

      const sumCols = [
        { title: 'Staff Name', x: 42, width: 155, align: 'left' },
        { title: 'Present Days', x: 205, width: 95, align: 'center' },
        { title: 'Half Days', x: 305, width: 85, align: 'center' },
        { title: 'Absences', x: 395, width: 80, align: 'center' },
        { title: 'Effective Days', x: 480, width: 75, align: 'center' },
      ];

      doc.rect(36, currentY, 523, 18).fill('#EEF2FF');
      doc.fillColor('#3730A3').font('Helvetica-Bold').fontSize(8);
      sumCols.forEach((sc) => {
        doc.text(sc.title, sc.x, currentY + 5, { width: sc.width, align: sc.align });
      });

      currentY += 18;

      staffSummaries.forEach((sum, idx) => {
        if (currentY > 740) {
          doc.addPage();
          currentY = 40;
        }

        const bg = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
        doc.rect(36, currentY, 523, 18).fill(bg);
        doc.rect(36, currentY, 523, 18).stroke('#E0E7FF');

        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1E293B');
        doc.text(cleanStaffName(sum.name), sumCols[0].x, currentY + 5, { width: sumCols[0].width, align: sumCols[0].align });

        doc.font('Helvetica').fillColor('#059669');
        doc.text(`${sum.present} days`, sumCols[1].x, currentY + 5, { width: sumCols[1].width, align: sumCols[1].align });

        doc.fillColor('#D97706');
        doc.text(`${sum.halfDay} days`, sumCols[2].x, currentY + 5, { width: sumCols[2].width, align: sumCols[2].align });

        doc.fillColor('#DC2626');
        doc.text(`${sum.absent} days`, sumCols[3].x, currentY + 5, { width: sumCols[3].width, align: sumCols[3].align });

        const effective = sum.present + (sum.halfDay * 0.5);
        doc.font('Helvetica-Bold').fillColor('#312E81');
        doc.text(`${effective}`, sumCols[4].x, currentY + 5, { width: sumCols[4].width, align: sumCols[4].align });

        currentY += 18;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Generate All Branches Sales History PDF (Owner Only comparison)
 * @param {Array} branchSummaries - Array of { branchId, branchName, branchCode, totals }
 * @param {Object} grandTotal - Consolidated grand totals
 * @param {String} fromDate - YYYY-MM-DD
 * @param {String} toDate - YYYY-MM-DD
 * @returns {Promise<Buffer>}
 */
const generateAllBranchesSalesPDF = (branchSummaries, grandTotal, fromDate, toDate) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // --- HEADER ---
      doc.rect(36, 36, 523, 70).fill('#065F46'); // Emerald 800

      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('Chendurar Sweets and Bakery - Sales History', 46, 46, { align: 'center', width: 503 });

      doc.font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#6EE7B7')
        .text('Consolidated Multi-Branch Comparison (All Branches)', 46, 66, { align: 'center', width: 503 });

      doc.font('Helvetica')
        .fontSize(9)
        .fillColor('#D1FAE5')
        .text(`Report Period: ${formatDate(fromDate)} to ${formatDate(toDate)} | Owner Consolidation`, 46, 80, { align: 'center', width: 503 });

      const generatedOn = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      doc.fontSize(7.5)
        .fillColor('#A7F3D0')
        .text(`Generated on: ${generatedOn} | Confidential Owner Report`, 46, 93, { align: 'center', width: 503 });

      // --- KPI BOXES FOR GRAND TOTALS ---
      const startY = 118;
      const boxWidth = 124;
      const boxHeight = 44;
      const gap = 9;

      const kpis = [
        { label: 'ALL BRANCHES SALES', value: formatINR(grandTotal.systemSales), color: '#065F46', bg: '#ECFDF5' },
        { label: 'ALL EXPENSES', value: formatINR(grandTotal.expenses), color: '#BE123C', bg: '#FFE4E6' },
        { label: 'TOTAL CASH', value: formatINR(grandTotal.totalCash), color: '#047857', bg: '#D1FAE5' },
        { label: 'TOTAL GPAY', value: formatINR(grandTotal.totalGpay), color: '#1D4ED8', bg: '#DBEAFE' },
      ];

      kpis.forEach((kpi, idx) => {
        const x = 36 + idx * (boxWidth + gap);
        doc.rect(x, startY, boxWidth, boxHeight).fill(kpi.bg);
        doc.rect(x, startY, boxWidth, boxHeight).stroke('#A7F3D0');

        doc.fillColor('#64748B')
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(kpi.label, x + 6, startY + 7, { width: boxWidth - 12, align: 'center' });

        doc.fillColor(kpi.color)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(kpi.value, x + 6, startY + 22, { width: boxWidth - 12, align: 'center' });
      });

      // --- SIDE-BY-SIDE BRANCH COMPARISON TABLE ---
      let currentY = 176;

      const cols = [
        { title: 'Branch', x: 42, width: 140, align: 'left' },
        { title: 'System Sales', x: 185, width: 75, align: 'right' },
        { title: 'Expenses', x: 263, width: 70, align: 'right' },
        { title: 'Cash', x: 336, width: 70, align: 'right' },
        { title: 'GPay', x: 409, width: 70, align: 'right' },
        { title: 'Difference', x: 482, width: 70, align: 'right' },
      ];

      doc.rect(36, currentY, 523, 22).fill('#064E3B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);

      cols.forEach((col) => {
        doc.text(col.title, col.x, currentY + 6, { width: col.width, align: col.align });
      });

      currentY += 22;

      branchSummaries.forEach((b, index) => {
        const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F0FDF4';
        doc.rect(36, currentY, 523, 22).fill(rowBg);
        doc.rect(36, currentY, 523, 22).stroke('#D1FAE5');

        const safeName = cleanText(b.branchName) || b.branchCode || 'Branch';

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1E293B');
        doc.text(safeName, cols[0].x, currentY + 6, { width: cols[0].width, align: cols[0].align });

        doc.font('Helvetica').fontSize(8).fillColor('#1E293B');
        doc.text(formatINR(b.totals.systemSales), cols[1].x, currentY + 6, { width: cols[1].width, align: cols[1].align });
        doc.text(formatINR(b.totals.expenses), cols[2].x, currentY + 6, { width: cols[2].width, align: cols[2].align });
        doc.text(formatINR(b.totals.totalCash), cols[3].x, currentY + 6, { width: cols[3].width, align: cols[3].align });
        doc.text(formatINR(b.totals.totalGpay), cols[4].x, currentY + 6, { width: cols[4].width, align: cols[4].align });

        const diff = b.totals.difference || 0;
        const diffSign = diff > 0 ? '+' : '';
        const diffColor = diff === 0 ? '#059669' : '#DC2626';
        doc.font('Helvetica-Bold').fillColor(diffColor);
        doc.text(diff === 0 ? 'Matched (0)' : `${diffSign}${formatINR(diff)}`, cols[5].x, currentY + 6, { width: cols[5].width, align: cols[5].align });

        currentY += 22;
      });

      // --- GRAND TOTAL ROW ---
      currentY += 6;
      doc.rect(36, currentY, 523, 24).fill('#D1FAE5');
      doc.rect(36, currentY, 523, 24).stroke('#059669');

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#065F46');
      doc.text('GRAND TOTAL', cols[0].x, currentY + 7, { width: cols[0].width, align: cols[0].align });
      doc.text(formatINR(grandTotal.systemSales), cols[1].x, currentY + 7, { width: cols[1].width, align: cols[1].align });
      doc.text(formatINR(grandTotal.expenses), cols[2].x, currentY + 7, { width: cols[2].width, align: cols[2].align });
      doc.text(formatINR(grandTotal.totalCash), cols[3].x, currentY + 7, { width: cols[3].width, align: cols[3].align });
      doc.text(formatINR(grandTotal.totalGpay), cols[4].x, currentY + 7, { width: cols[4].width, align: cols[4].align });

      const gDiff = grandTotal.difference || 0;
      const gDiffSign = gDiff > 0 ? '+' : '';
      const gDiffColor = gDiff === 0 ? '#059669' : '#DC2626';
      doc.fillColor(gDiffColor);
      doc.text(gDiff === 0 ? 'Matched (0)' : `${gDiffSign}${formatINR(gDiff)}`, cols[5].x, currentY + 7, { width: cols[5].width, align: cols[5].align });

      currentY += 34;

      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#475569')
        .text('Generated from Chendurar Sweets & Bakery Multi-Branch Central Point-of-Sale System.', 36, currentY, { width: 523, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateSalesHistoryPDF,
  generateAttendanceHistoryPDF,
  generateAllBranchesSalesPDF,
  cleanText,
  cleanStaffName,
};

