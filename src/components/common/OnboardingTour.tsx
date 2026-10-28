import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  route?: string;
  highlight?: string; // CSS selector to highlight
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to FactorySim',
    description: 'A 1-minute tour of the three steps: build your line, run it, compare improvements. You can skip at any time.',
  },
  {
    title: '1 · Build your line',
    description: 'On the Build tab, add elements from the ribbon (Source, Station, Buffer, …) or press Load template. Drag from a handle to connect elements.',
    route: '/builder',
  },
  {
    title: 'Edit details',
    description: 'Select an element in the Outline on the left or on the canvas. Its details (cycle time, capacity, breakdowns) open on the right.',
    route: '/builder',
  },
  {
    title: '2 · Run & see results',
    description: 'On the Run & Results tab, choose the run length under Settings in the ribbon and press Run simulation.',
    route: '/dashboard',
  },
  {
    title: 'Read the results',
    description: 'The Results summary says what the line produced, which station is the bottleneck and what to try. Charts and tables follow below.',
    route: '/dashboard',
  },
  {
    title: '3 · Compare scenarios',
    description: 'On the Compare tab, run what-if scenarios (faster machine, bigger buffer, extra shift) and compare them against your baseline.',
    route: '/scenarios',
  },
  {
    title: "You're ready",
    description: 'Switch off Simple mode (top right) for expert tools: 3D World, parameter sweeps, experiments, code export and plugins.',
    route: '/builder',
  },
];

const TOUR_STORAGE_KEY = 'factorysim-tour-completed';

export function OnboardingTour() {
  const [isActive, setIsActive] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // Show tour on first visit
  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed && location.pathname === '/dashboard') {
      const timer = setTimeout(() => setIsActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  const handleNext = () => {
    const nextStep = step + 1;
    if (nextStep >= TOUR_STEPS.length) {
      handleClose();
      return;
    }
    setStep(nextStep);
    const nextRoute = TOUR_STEPS[nextStep].route;
    if (nextRoute && location.pathname !== nextRoute) {
      navigate(nextRoute);
    }
  };

  const handlePrev = () => {
    const prevStep = Math.max(0, step - 1);
    setStep(prevStep);
    const prevRoute = TOUR_STEPS[prevStep].route;
    if (prevRoute && location.pathname !== prevRoute) {
      navigate(prevRoute);
    }
  };

  const handleClose = () => {
    setIsActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  };

  if (!isActive) return null;

  const currentStep = TOUR_STEPS[step];

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={handleClose} />

      {/* Tour card */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-[420px]">
          {/* Progress */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex space-x-1">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i === step ? 'bg-primary-600' : i < step ? 'bg-primary-300' : 'bg-gray-200'}`}
                />
              ))}
            </div>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600" aria-label="Close tour">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <h3 className="font-semibold text-gray-900 text-sm">{currentStep.title}</h3>
          <p className="text-gray-600 text-sm mt-1 leading-relaxed">{currentStep.description}</p>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={handleClose}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Skip tour
            </button>
            <div className="flex space-x-2">
              {step > 0 && (
                <button
                  onClick={handlePrev}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <ChevronLeft className="w-3 h-3 mr-1" />
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                {step === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
                {step < TOUR_STEPS.length - 1 && <ChevronRight className="w-3 h-3 ml-1" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Button to restart the tour from Settings or Help.
 */
export function RestartTourButton() {
  const navigate = useNavigate();

  const handleRestart = () => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    navigate('/dashboard');
    window.location.reload();
  };

  return (
    <button
      onClick={handleRestart}
      className="text-sm text-primary-600 hover:text-primary-700 underline"
    >
      Restart guided tour
    </button>
  );
}
