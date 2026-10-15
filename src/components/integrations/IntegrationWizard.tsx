import { useState } from "react";
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface WizardStep {
  title: string;
  instructions: { text: string; bold?: string }[];
  fieldLabel: string;
  fieldPlaceholder: string;
  fieldMultiple?: boolean;
  helpLink?: { url: string; label: string };
}

interface TestResult {
  ok: boolean;
  message: string;
  details?: string;
}

interface IntegrationWizardProps {
  steps: WizardStep[];
  onTest: (values: string[]) => Promise<TestResult>;
  onFinish: (values: string[]) => void;
  platformName: string;
}

export function IntegrationWizard({ steps, onTest, onFinish, platformName }: IntegrationWizardProps) {
  const totalSteps = steps.length + 1; // +1 for confirmation step
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<string[]>(steps.map(() => ""));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const progress = ((currentStep + 1) / totalSteps) * 100;
  const isConfirmationStep = currentStep === steps.length;

  const canContinue = !isConfirmationStep && values[currentStep]?.trim().length > 0;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setTestResult(null);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(values);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || "Erro desconhecido ao testar conexão." });
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = () => {
    onFinish(values);
  };

  const step = !isConfirmationStep ? steps[currentStep] : null;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Passo {currentStep + 1} de {totalSteps}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
              i < currentStep
                ? "bg-primary border-primary text-primary-foreground"
                : i === currentStep
                  ? "border-primary text-primary bg-primary/10"
                  : "border-muted-foreground/30 text-muted-foreground"
            )}>
              {i < currentStep ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            {i < totalSteps - 1 && (
              <div className={cn("h-px w-6", i < currentStep ? "bg-primary" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {!isConfirmationStep && step && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <h3 className="text-base font-semibold text-foreground">{step.title}</h3>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
            <ol className="text-xs text-muted-foreground space-y-2.5 list-decimal list-inside">
              {step.instructions.map((inst, i) => (
                <li key={i}>
                  {inst.bold ? (
                    <>{inst.text} <strong>{inst.bold}</strong></>
                  ) : (
                    inst.text
                  )}
                </li>
              ))}
            </ol>
            {step.helpLink && (
              <a
                href={step.helpLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2"
              >
                <ExternalLink className="h-3 w-3" />
                {step.helpLink.label}
              </a>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{step.fieldLabel}</Label>
            <Input
              placeholder={step.fieldPlaceholder}
              value={values[currentStep]}
              onChange={(e) => {
                const newValues = [...values];
                newValues[currentStep] = e.target.value;
                setValues(newValues);
              }}
            />
            {step.fieldMultiple && (
              <p className="text-[10px] text-muted-foreground">Separe múltiplos valores com vírgula</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={currentStep === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <Button size="sm" onClick={handleNext} disabled={!canContinue}>
              Continuar
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation step */}
      {isConfirmationStep && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <h3 className="text-base font-semibold text-foreground">Confirmação</h3>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border/50">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--warroom-positive))] shrink-0" />
                <span className="text-sm text-foreground">{s.fieldLabel}</span>
                <span className="text-xs text-muted-foreground ml-auto font-mono truncate max-w-[160px]">
                  {values[i]?.includes(",")
                    ? `${values[i].split(",").length} itens`
                    : values[i]?.slice(0, 20) + (values[i]?.length > 20 ? "…" : "")}
                </span>
              </div>
            ))}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={cn(
              "rounded-lg p-4 border text-sm",
              testResult.ok
                ? "bg-[hsl(var(--warroom-positive))]/10 border-[hsl(var(--warroom-positive))]/30 text-[hsl(var(--warroom-positive))]"
                : "bg-destructive/10 border-destructive/30 text-destructive"
            )}>
              <div className="flex items-start gap-2">
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="font-medium">{testResult.message}</p>
                  {testResult.details && (
                    <p className="text-xs mt-1 opacity-80">{testResult.details}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleTest}
                disabled={testing}
              >
                {testing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Testar conexão
              </Button>
              {testResult?.ok && (
                <Button size="sm" onClick={handleFinish}>
                  Finalizar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
