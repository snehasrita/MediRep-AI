"use client";

import React, { Children, useCallback, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StepperProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  initialStep?: number; // 1-based
  onStepChange?: (step: number) => void;
  /**
   * If this returns/resolve false, Stepper will NOT mark itself completed.
   * Throw to signal an error (consumer should toast).
   */
  onFinalStepCompleted?: () => void | boolean | Promise<void | boolean>;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: RenderStepIndicatorProps) => React.ReactNode;
}

interface RenderStepIndicatorProps {
  step: number;
  currentStep: number;
  onStepClick: (clicked: number) => void;
}

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  stepCircleContainerClassName,
  stepContainerClassName,
  contentClassName,
  footerClassName,
  backButtonProps = {},
  nextButtonProps = {},
  backButtonText = "Back",
  nextButtonText = "Continue",
  completeButtonText = "Complete",
  disableStepIndicators = false,
  renderStepIndicator,
  className,
  ...rest
}: StepperProps) {
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [direction, setDirection] = useState<number>(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;

  const updateStep = (newStep: number) => {
    setCurrentStep(newStep);
    if (newStep <= totalSteps) onStepChange(newStep);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setDirection(1);
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = useCallback(async () => {
    if (isCompleting) return;
    setIsCompleting(true);

    try {
      const res = await onFinalStepCompleted();
      if (res === false) return;

      setDirection(1);
      setCurrentStep(totalSteps + 1);
    } catch (err) {
      // Keep the Stepper stable. Consumers should toast/handle errors upstream.
      console.error(err);
    } finally {
      setIsCompleting(false);
    }
  }, [isCompleting, onFinalStepCompleted, totalSteps]);

  return (
    <div className={cn("flex w-full flex-col items-center justify-center", className)} {...rest}>
      <div
        className={cn(
          "w-full max-w-3xl overflow-hidden rounded-3xl border bg-card/70 shadow-[0_22px_70px_rgba(0,0,0,0.10)] backdrop-blur",
          stepCircleContainerClassName
        )}
      >
        <div className={cn("flex w-full items-center px-6 pt-6", stepContainerClassName)}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLast = index < totalSteps - 1;

            return (
              <React.Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    onStepClick: (clicked) => {
                      if (disableStepIndicators) return;
                      setDirection(clicked > currentStep ? 1 : -1);
                      updateStep(clicked);
                    },
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    currentStep={currentStep}
                    disableStepIndicators={disableStepIndicators}
                    onClickStep={(clicked) => {
                      setDirection(clicked > currentStep ? 1 : -1);
                      updateStep(clicked);
                    }}
                  />
                )}
                {isNotLast && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            );
          })}
        </div>

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={cn("relative overflow-hidden", contentClassName)}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (
          <div className={cn("px-6 pb-6", footerClassName)}>
            <div className={cn("mt-6 flex", currentStep !== 1 ? "justify-between" : "justify-end")}>
              {currentStep !== 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
                    "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60",
                    isCompleting ? "pointer-events-none opacity-70" : ""
                  )}
                  disabled={currentStep === 1 || isCompleting || backButtonProps.disabled}
                  {...backButtonProps}
                >
                  {backButtonText}
                </button>
              )}

              <button
                type="button"
                onClick={isLastStep ? handleComplete : handleNext}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold",
                  "bg-emerald-600 text-white shadow-[0_14px_30px_rgba(16,185,129,0.25)]",
                  "transition-all hover:brightness-95 disabled:opacity-60 disabled:shadow-none",
                  isCompleting ? "pointer-events-none opacity-70" : ""
                )}
                disabled={isCompleting || nextButtonProps.disabled}
                {...nextButtonProps}
              >
                {isLastStep ? completeButtonText : nextButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StepContentWrapperProps {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: React.ReactNode;
  className?: string;
}

function StepContentWrapper({
  isCompleted,
  currentStep,
  direction,
  children,
  className,
}: StepContentWrapperProps) {
  const [parentHeight, setParentHeight] = useState<number>(0);

  return (
    <motion.div
      className={className}
      style={{ position: "relative", overflow: "hidden" }}
      animate={{ height: isCompleted ? 0 : parentHeight }}
      transition={{ type: "spring", duration: 0.45 }}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={setParentHeight}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SlideTransitionProps {
  children: React.ReactNode;
  direction: number;
  onHeightReady: (h: number) => void;
}

function SlideTransition({ children, direction, onHeightReady }: SlideTransitionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (containerRef.current) onHeightReady(containerRef.current.offsetHeight);
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="absolute inset-x-0 top-0 px-6 pb-4 pt-4"
    >
      {children}
    </motion.div>
  );
}

const stepVariants: Variants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? "-100%" : "100%",
    opacity: 0,
  }),
  center: {
    x: "0%",
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? "50%" : "-50%",
    opacity: 0,
  }),
};

export function Step({ children }: { children: React.ReactNode }) {
  return <div className="pb-2">{children}</div>;
}

function StepIndicator({
  step,
  currentStep,
  onClickStep,
  disableStepIndicators,
}: {
  step: number;
  currentStep: number;
  onClickStep: (step: number) => void;
  disableStepIndicators?: boolean;
}) {
  const status: "active" | "inactive" | "complete" =
    currentStep === step ? "active" : currentStep < step ? "inactive" : "complete";

  return (
    <button
      type="button"
      onClick={() => {
        if (disableStepIndicators || step === currentStep) return;
        onClickStep(step);
      }}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        disableStepIndicators ? "cursor-default" : "cursor-pointer"
      )}
      aria-current={status === "active" ? "step" : undefined}
      aria-label={`Step ${step}`}
    >
      <motion.span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
          "transition-colors"
        )}
        variants={{
          inactive: { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" },
          active: { backgroundColor: "rgba(16,185,129,0.16)", color: "rgb(5,150,105)" },
          complete: { backgroundColor: "rgb(5,150,105)", color: "#fff" },
        }}
        animate={status}
        initial={false}
        transition={{ duration: 0.25 }}
      >
        {status === "complete" ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : status === "active" ? (
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden />
        ) : (
          <span>{step}</span>
        )}
      </motion.span>
    </button>
  );
}

function StepConnector({ isComplete }: { isComplete: boolean }) {
  return (
    <div className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-muted">
      <motion.div
        className="h-full bg-emerald-600"
        initial={false}
        animate={{ width: isComplete ? "100%" : 0 }}
        transition={{ duration: 0.35 }}
      />
    </div>
  );
}
