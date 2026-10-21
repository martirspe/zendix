export type CsvDelimiter = ',' | ';' | '\t' | '|';
export interface CsvTable { headers: string[]; rows: string[][]; delimiter: CsvDelimiter; }
export class CsvError extends Error {}

export function decodeCsv(bytes: ArrayBuffer): string {
  const prefix = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (prefix[0] === 255 && prefix[1] === 254) return new TextDecoder('utf-16le').decode(bytes);
  if (prefix[0] === 254 && prefix[1] === 255) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

export function parseCsv(source: string, delimiter?: CsvDelimiter): CsvTable {
  let input = source.replace(/^\uFEFF/, '');
  const directive = /^sep=([,;\t|])\r?\n/i.exec(input);
  if (directive) { delimiter ??= directive[1] as CsvDelimiter; input = input.slice(directive[0].length); }
  if (!delimiter) {
    const counts = new Map<CsvDelimiter, number>([[',',0],[';',0],['\t',0],['|',0]]);
    let quoted = false;
    for (let index=0; index<input.length; index++) {
      const char=input[index];
      if (char==='"') { if (quoted && input[index+1]==='"') index++; else quoted=!quoted; }
      else if (!quoted && (char==='\r'||char==='\n')) break;
      else if (!quoted && counts.has(char as CsvDelimiter)) counts.set(char as CsvDelimiter,(counts.get(char as CsvDelimiter)??0)+1);
    }
    delimiter = [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]??',';
  }
  const records: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; if (row.length > 100) throw new CsvError('El archivo supera las 100 columnas.'); };
  const finishRow = () => { finishField(); if (row.some(value => value.trim())) records.push(row); row = []; if (records.length > 50001) throw new CsvError('El archivo supera los 50 000 contactos. Divide el archivo en varias importaciones.'); };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === delimiter) finishField();
    else if (char === '\n' || char === '\r') { if (char === '\r' && input[index + 1] === '\n') index++; finishRow(); }
    else if (char === '"' && field === '' && !closed) quoted = true;
    else { if ((closed && !/\s/.test(char)) || char === '"') throw new CsvError('Hay comillas mal cerradas cerca del registro '+(records.length+1)+'.'); if (!closed) field += char; }
  }
  if (quoted) throw new CsvError('Hay un campo con comillas sin cerrar. Revisa el final del archivo.');
  if (field || row.length || closed) finishRow();
  const used = new Set<string>();
  const headers = (records.shift() ?? []).map((value,index) => {
    const base=value.trim()||'Columna '+(index+1); let header=base, suffix=2;
    while(used.has(header.toLowerCase()))header=base+' ('+suffix+++')';
    used.add(header.toLowerCase());return header;
  });
  if (!headers.length) throw new CsvError('El archivo está vacío.');
  records.forEach((record,index) => {
    if (record.length>headers.length) throw new CsvError('El registro '+(index+2)+' tiene más columnas que los encabezados. Revisa el separador.');
    while(record.length<headers.length)record.push('');
  });
  return {headers, rows: records, delimiter};
}
