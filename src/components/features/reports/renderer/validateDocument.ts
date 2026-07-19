import type { AirspecDocument, AirspecParameter } from '../../types/airspec';

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

export interface ValidationError {
  path: string;
  message: string;
}

export function validateDocument(doc: AirspecDocument): ValidationError[] {
  const errors: ValidationError[] = [];

  if (doc.airspec !== '1.1') {
    errors.push({ path: 'airspec', message: `Expected "1.1", got "${doc.airspec}"` });
  }

  if (!doc.layout) {
    errors.push({ path: 'layout', message: 'Document has no layout' });
  }

  // Build parameter type + option lookup for binding validation.
  const paramTypes = new Map<string, string>();
  const selectOptions = new Map<string, (string | number | boolean)[]>();
  for (const p of doc.parameters ?? []) {
    paramTypes.set(p.id, p.type);
    if (p.type === 'select' && p.options?.type === 'static') {
      selectOptions.set(p.id, (p.options.values ?? []).map((v) => v.value));
    }
  }

  const checkBindingParam = (paramId: string, path: string) => {
    const ptype = paramTypes.get(paramId);
    if (!ptype) return; // missing param is a separate check
    if (ptype !== 'select' && ptype !== 'boolean') {
      errors.push({
        path,
        message: `parameter "${paramId}" must be select or boolean to drive a binding (got "${ptype}")`,
      });
    }
  };

  for (const ds of doc.datasets ?? []) {
    if (!ID_RE.test(ds.source)) {
      errors.push({
        path: `datasets[${ds.id}].source`,
        message: `"${ds.source}" is not a valid id (must start with a letter, cannot be a raw UUID)`,
      });
    }
    if (ds.bindings) {
      for (const [prop, b] of Object.entries(ds.bindings)) {
        if (b?.parameter) checkBindingParam(b.parameter, `datasets[${ds.id}].bindings.${prop}`);
      }
    }
  }

  const walkFormat = (val: unknown, path: string) => {
    if (val === null || val === undefined) return;
    if (typeof val === 'string') {
      errors.push({ path: `${path}.format`, message: `Format must be an object, not a string like "${val}"` });
      return;
    }
    if (typeof val === 'object' && !Array.isArray(val)) {
      const f = val as Record<string, unknown>;
      if (f.type && !['number', 'currency', 'percent', 'date', 'datetime', 'duration', 'text', 'badge'].includes(f.type as string)) {
        errors.push({ path: `${path}.format.type`, message: `Invalid format type "${f.type}"` });
      }
    }
  };

  const walkNode = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;

    if (n.format !== undefined) walkFormat(n.format, path);

    if (n.graphicBinding) {
      const gb = n.graphicBinding as Record<string, unknown>;
      if (gb.parameter) checkBindingParam(gb.parameter as string, `${path}.graphicBinding`);
    }

    if (Array.isArray(n.columns)) {
      n.columns.forEach((c, i) => walkFormat((c as Record<string, unknown>).format, `${path}.columns[${i}]`));
    }

    if (n.graphic && typeof n.graphic === 'object') {
      const g = n.graphic as Record<string, unknown>;
      if (g.encoding && typeof g.encoding === 'object') {
        for (const [ch, val] of Object.entries(g.encoding as Record<string, unknown>)) {
          if (Array.isArray(val)) {
            val.forEach((c, i) => walkFormat((c as Record<string, unknown>).format, `${path}.encoding.${ch}[${i}]`));
          } else if (val && typeof val === 'object') {
            walkFormat((val as Record<string, unknown>).format, `${path}.encoding.${ch}`);
            const axis = (val as Record<string, unknown>).axis;
            if (axis && typeof axis === 'object') walkFormat((axis as Record<string, unknown>).format, `${path}.encoding.${ch}.axis`);
            const legend = (val as Record<string, unknown>).legend;
            if (legend && typeof legend === 'object') walkFormat((legend as Record<string, unknown>).format, `${path}.encoding.${ch}.legend`);
          }
        }
      }
    }

    if (Array.isArray(n.children)) {
      n.children.forEach((c, i) => walkNode(c, `${path}.children[${i}]`));
    }
  };

  walkNode(doc.layout, 'layout');

  return errors;
}
