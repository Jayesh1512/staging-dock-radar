"use client";
import { cn } from "@/lib/utils";

interface StepTabsProps {
  activeStep: number;
  onStepChange: (step: number) => void;
  queueCount: number;
  step3Enabled: boolean;
}

const steps = [
  { num: 1, label: 'Collect' },
  { num: 2, label: 'Score' },
  { num: 3, label: 'Queue' },
];

export function StepTabs({ activeStep, onStepChange, queueCount, step3Enabled }: StepTabsProps) {
  return (
    <div className="sticky z-[90] bg-white border-b" style={{ top: 53, borderColor: 'var(--dr-border)' }}>
      <div className="flex items-center px-8" style={{ maxWidth: 'var(--dr-max-w)', margin: '0 auto' }}>
        {steps.map((step) => {
          const isActive = activeStep === step.num;
          const isDisabled = step.num === 3 && !step3Enabled;
          return (
            <button
              key={step.num}
              onClick={() => !isDisabled && onStepChange(step.num)}
              disabled={isDisabled}
              className={cn(
                "relative flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px transition-colors",
                isActive ? "border-[var(--dr-blue)] text-[var(--dr-blue)]" : "border-transparent text-[var(--dr-text-disabled)] hover:text-[var(--dr-text-muted)]",
                isDisabled && "opacity-40 cursor-not-allowed"
              )}
              style={{ padding: '14px 20px', fontSize: 13.5, fontWeight: 500 }}
            >
              <span
                className="rounded-full"
                style={{
                  width: 8, height: 8,
                  border: `2px solid ${isActive ? 'var(--dr-blue)' : '#D1D5DB'}`,
                  background: isActive ? 'var(--dr-blue)' : 'transparent',
                }}
              />
              {step.num}. {step.label}
              {step.num === 3 && queueCount > 0 && (
                <span className="text-white font-bold rounded-full" style={{ background: 'var(--dr-blue)', fontSize: 10, padding: '1px 7px', lineHeight: 1.6 }}>
                  {queueCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
