import type { OperationFeature } from "@/contexts/OperationContext";
import { DEFAULT_FEATURES } from "@/contexts/OperationContext";

export interface PlanConfig {
  key: string;
  label: string;
  maxMetaAccounts: number | null; // null = unlimited
  maxMembers: number | null;      // null = unlimited
  defaultFeatures: OperationFeature[];
  description: string;
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  starter: {
    key: "starter",
    label: "Starter",
    maxMetaAccounts: 5,
    maxMembers: 3,
    defaultFeatures: [...DEFAULT_FEATURES],
    description: "Até 5 contas Meta • 3 membros",
  },
  pro: {
    key: "pro",
    label: "Pro",
    maxMetaAccounts: 20,
    maxMembers: 10,
    defaultFeatures: [...DEFAULT_FEATURES, "academy", "jarvis"],
    description: "Até 20 contas Meta • 10 membros",
  },
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    maxMetaAccounts: null,
    maxMembers: null,
    defaultFeatures: [...DEFAULT_FEATURES, "academy", "jarvis", "talent_bank"],
    description: "Ilimitado",
  },
};

export function getPlanConfig(plan: string): PlanConfig {
  return PLAN_CONFIGS[plan] || PLAN_CONFIGS.enterprise;
}

export function formatLimit(val: number | null): string {
  return val === null ? "Ilimitado" : String(val);
}
