import type { DesignerDoc, DesignerElement, TextRun } from './designer.store';

function normalizeHex(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (!v.startsWith('#')) v = `#${v}`;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
    return v.toUpperCase();
  }
  return null;
}

function isBrandColor(value: string | undefined, brandColors: string[]): boolean {
  if (!value) return true;
  const hex = normalizeHex(value);
  if (!hex) return true; // non-hex values (e.g. gradients) are checked separately
  return brandColors.includes(hex);
}

function isBrandFont(value: string | undefined, brandFonts: string[]): boolean {
  if (!value) return true;
  return brandFonts.some((f) => f.toLowerCase() === value.toLowerCase());
}

function collectColorViolations(
  el: DesignerElement,
  brandColors: string[],
  violations: string[]
) {
  if (el.fill && !isBrandColor(el.fill, brandColors)) {
    violations.push(`${el.type} element uses off-brand fill ${el.fill}`);
  }
  if (el.stroke && !isBrandColor(el.stroke, brandColors)) {
    violations.push(`${el.type} element uses off-brand stroke ${el.stroke}`);
  }
  if (el.textShadow?.color && !isBrandColor(el.textShadow.color, brandColors)) {
    violations.push(`text shadow uses off-brand color ${el.textShadow.color}`);
  }
  if (el.textStroke?.color && !isBrandColor(el.textStroke.color, brandColors)) {
    violations.push(`text outline uses off-brand color ${el.textStroke.color}`);
  }
  if (el.boxShadow?.color && !isBrandColor(el.boxShadow.color, brandColors)) {
    violations.push(`box shadow uses off-brand color ${el.boxShadow.color}`);
  }
  if (el.fillGradient?.stops?.length) {
    el.fillGradient.stops.forEach((stop, i) => {
      if (!isBrandColor(stop.color, brandColors)) {
        violations.push(`gradient stop ${i + 1} uses off-brand color ${stop.color}`);
      }
    });
  }
  if (el.richText?.length) {
    el.richText.forEach((run, i) => {
      if (run.fill && !isBrandColor(run.fill, brandColors)) {
        violations.push(`rich-text run ${i + 1} uses off-brand color ${run.fill}`);
      }
    });
  }
}

function collectFontViolations(
  el: DesignerElement,
  brandFonts: string[],
  violations: string[]
) {
  if (el.type !== 'text') return;
  if (el.fontFamily && !isBrandFont(el.fontFamily, brandFonts)) {
    violations.push(`text element uses off-brand font ${el.fontFamily}`);
  }
  if (el.richText?.length) {
    el.richText.forEach((run, i) => {
      if (run.fontFamily && !isBrandFont(run.fontFamily, brandFonts)) {
        violations.push(`rich-text run ${i + 1} uses off-brand font ${run.fontFamily}`);
      }
    });
  }
}

export interface BrandComplianceConfig {
  enforcement: boolean;
  adminOverride: boolean;
  brandColors: string[];
  brandFonts: string[];
}

export function getBrandViolations(
  doc: DesignerDoc,
  config: BrandComplianceConfig
): string[] {
  if (!config.enforcement || config.adminOverride) return [];

  const colorEnforced = config.brandColors.length > 0;
  const fontEnforced = config.brandFonts.length > 0;
  if (!colorEnforced && !fontEnforced) return [];

  const violations: string[] = [];
  for (const output of doc.outputs) {
    if (!('children' in output)) continue;
    for (const el of output.children) {
      if (el.hidden) continue;
      if (colorEnforced) collectColorViolations(el, config.brandColors, violations);
      if (fontEnforced) collectFontViolations(el, config.brandFonts, violations);
    }
  }

  return violations;
}
