// Geração de CSV simples (sem dependências externas) e disparo do download no browser.
function escapeCsvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\r\n');
}

// BOM UTF-8 no início garante que acentos abram corretamente quando o CSV é aberto no Excel.
export function downloadCsv(filename, headers, rows) {
  const csvContent = `﻿${buildCsv(headers, rows)}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
