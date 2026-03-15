import { cn } from '@/lib/utils';

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
    <div className="sticky top-14 z-40 bg-white border-b border-border-default">
      <div className="mx-auto flex max-w-[var(--max-w-content)] px-8">
        {steps.map((step) => {
          const isActive = activeStep === step.num;
          const isDisabled = step.num === 3 && !step3Enabled;

          return (
            <button
              key={step.num}
              onClick={() => !isDisabled && onStepChange(step.num)}
              disabled={isDisabled}
              className={cn(
                'relative flex items-center gap-2 px-5 py-3 text-[13px] font-medium transition-colors',
                'border-b-2 -mb-[1px]',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary',
                isDisabled && 'opacity-40 cursor-not-allowed hover:text-text-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                  isActive ? 'bg-primary text-white' : 'bg-gray-200 text-text-muted',
                )}
              >
                {step.num}
              </span>
              {step.label}
              {step.num === 3 && queueCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
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
