/**
 * Maps VSL video names to project codes using keyword matching.
 * Shared by edge functions (mirror of src/lib/vslProjectMapping.ts).
 */

interface VslProjectRule {
  project: string;
  keywords: string[];
}

const VSL_PROJECT_RULES: VslProjectRule[] = [
  { project: "NDM", keywords: ["neurocept", "microlead", "neuro lead", "ndm", "memo", "neurocep"] },
  { project: "CRT", keywords: ["corestrength", "core strength", "core_strength", "crt", "ailula", "corestre"] },
  { project: "NDB", keywords: ["synaboost", "synab", "ndb", "blueberry"] },
  { project: "LDR", keywords: ["leandrop", "lean drop", "ldg", "ldr"] },
  { project: "NDR", keywords: ["ndr", "retargeting"] },
  { project: "ERX", keywords: ["erx"] },
  { project: "GLP", keywords: ["glp"] },
];

export function mapVslToProject(vslName: string): string | null {
  if (!vslName) return null;
  const lower = vslName.toLowerCase();
  for (const rule of VSL_PROJECT_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return rule.project;
    }
  }
  return null;
}
