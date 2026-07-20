import type { DataSourceField } from '../types/airspec';

export function slugifyFieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_+$/g, '')
    .replace(/_+/g, '_') || 'field';
}

export function parseCsvText(text: string): {
  fields: DataSourceField[];
  rows: Record<string, unknown>[];
} {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    return { fields: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }

  const fields = inferFieldTypes(headers, rows);
  return { fields, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function inferFieldTypes(
  headers: string[],
  rows: Record<string, unknown>[]
): DataSourceField[] {
  const sampleSize = Math.min(rows.length, 100);
  const sample = rows.slice(0, sampleSize);

  return headers.map((name) => {
    let numericCount = 0;
    let booleanCount = 0;
    let nonEmptyCount = 0;

    for (const row of sample) {
      const val = String(row[name] ?? '').trim();
      if (val === '' || val === 'NaN' || val === 'null' || val === 'undefined') continue;
      nonEmptyCount++;

      if (!isNaN(Number(val))) {
        numericCount++;
      }
      if (val === 'true' || val === 'false' || val === '0' || val === '1') {
        booleanCount++;
      }
    }

    let type: DataSourceField['type'] = 'string';
    if (nonEmptyCount > 0) {
      if (numericCount / nonEmptyCount > 0.9) {
        type = 'number';
      } else if (booleanCount / nonEmptyCount > 0.9) {
        type = 'boolean';
      }
    }

    return { name, key: slugifyFieldName(name), type };
  });
}

export function coerceRowValues(
  rows: Record<string, unknown>[],
  fields: DataSourceField[]
): Record<string, unknown>[] {
  const fieldMap = new Map(fields.map((f) => [f.name, f.type]));

  return rows.map((row) => {
    const coerced: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
      const type = fieldMap.get(key);

      if (type === 'object' || type === 'array') {
        coerced[key] = val;
        continue;
      }

      if (val !== null && typeof val === 'object') {
        coerced[key] = val;
        continue;
      }

      const strVal = String(val ?? '').trim();

      if (strVal === '' || strVal === 'NaN' || strVal === 'null') {
        coerced[key] = null;
        continue;
      }

      if (type === 'number') {
        const num = Number(strVal);
        coerced[key] = isNaN(num) ? null : num;
      } else if (type === 'boolean') {
        coerced[key] = strVal === 'true' || strVal === '1';
      } else {
        coerced[key] = strVal;
      }
    }
    return coerced;
  });
}
