// File: src/utils/exportUtils.js
// Purpose: Export data to CSV, Excel (xlsx), and PDF
// Dependencies: xlsx, jspdf, jspdf-autotable

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================
// CSV Export
// ============================================
export const downloadCSV = (filename, rows) => {
  if (!rows || rows.length === 0) {
    alert('No data to export');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
};

// ============================================
// Excel Export (XLSX)
// ============================================
export const downloadExcel = (filename, rows, sheetName = 'Data') => {
  if (!rows || rows.length === 0) {
    alert('No data to export');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-width columns
  const colWidths = Object.keys(rows[0]).map(key => {
    const maxLen = Math.max(
      key.length,
      ...rows.map(r => String(r[key] || '').length)
    );
    return { wch: Math.min(50, maxLen + 2) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
};

// ============================================
// PDF Export (Table)
// ============================================
export const downloadPDF = (filename, options = {}) => {
  const {
    title = 'Report',
    subtitle = '',
    headers = [],
    rows = [],
    footer = '',
    orientation = 'portrait',
    branchName = '',
    dateRange = '',
  } = options;

  if (!rows || rows.length === 0) {
    alert('No data to export');
    return;
  }

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  // Brand header
  pdf.setFontSize(18);
  pdf.setTextColor(184, 134, 11); // amber-700
  pdf.text('A One Jewelry', 14, 18);

  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text(title, 14, 28);

  if (subtitle) {
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text(subtitle, 14, 34);
  }

  if (branchName || dateRange) {
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    const meta = [
      branchName && `Branch: ${branchName}`,
      dateRange && `Period: ${dateRange}`,
      `Generated: ${new Date().toLocaleString()}`,
    ].filter(Boolean).join('  |  ');
    pdf.text(meta, 14, 40);
  }

  // Auto table
  autoTable(pdf, {
    startY: 46,
    head: [headers],
    body: rows,
    theme: 'striped',
    headStyles: {
      fillColor: [184, 134, 11],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [255, 250, 240] },
    margin: { left: 14, right: 14 },
  });

  // Footer on every page
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      footer || `Page ${i} of ${pageCount}`,
      14,
      pdf.internal.pageSize.height - 8
    );
    pdf.text(
      `Page ${i} of ${pageCount}`,
      pdf.internal.pageSize.width - 30,
      pdf.internal.pageSize.height - 8
    );
  }

  pdf.save(filename);
};

// ============================================
// Helper: Trigger browser download
// ============================================
const triggerDownload = (blob, filename) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 100);
};

// ============================================
// Convenience: Export with all 3 formats
// ============================================
export const exportData = (format, filename, rows, options = {}) => {
  const baseFilename = filename.replace(/\.(csv|xlsx|pdf)$/, '');

  switch (format) {
    case 'csv':
      return downloadCSV(`${baseFilename}.csv`, rows);
    case 'excel':
    case 'xlsx':
      return downloadExcel(`${baseFilename}.xlsx`, rows, options.sheetName);
    case 'pdf':
      return downloadPDF(`${baseFilename}.pdf`, {
        ...options,
        headers: options.headers || Object.keys(rows[0] || {}),
        rows: options.rows || rows.map(r => Object.values(r)),
      });
    default:
      return downloadCSV(`${baseFilename}.csv`, rows);
  }
};

export default {
  downloadCSV,
  downloadExcel,
  downloadPDF,
  exportData,
};