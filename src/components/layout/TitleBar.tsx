import {useEffect, useState} from 'react';
import {FiMinus, FiSquare, FiX} from 'react-icons/fi';

export default function TitleBar() {
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );

  useEffect(() => {
    // Listen for feedback events from main process
    const cleanup = (window as any).api.window.onFeedback(
      (type: 'success' | 'error') => {
        setFeedback(type);
        // Reset after animation
        setTimeout(() => setFeedback('idle'), 2000);
      }
    );
    return cleanup;
  }, []);

  const getBgColor = () => {
    switch (feedback) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      default:
        return 'bg-white text-neutral-600 border-b border-neutral-200';
    }
  };

  return (
    <div
      className={`h-8 flex items-center justify-between select-none transition-colors duration-500 ${getBgColor()}`}
      style={{WebkitAppRegion: 'drag'} as any} // Allow dragging
    >
      {/* Title / Logo Area */}
      <div className="px-3 text-sm font-bold tracking-wide uppercase flex items-center gap-2">
        <span>Legerly</span>
        {feedback === 'success' && (
          <span className="font-normal opacity-90">- Saved Successfully</span>
        )}
        {feedback === 'error' && (
          <span className="font-normal opacity-90">- Save Failed</span>
        )}
      </div>

      {/* Window Controls */}
      <div className="flex h-full" style={{WebkitAppRegion: 'no-drag'} as any}>
        <button
          onClick={() => (window as any).api.window.minimize()}
          className="h-full w-10 flex items-center justify-center hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none"
          tabIndex={-1}>
          <FiMinus className="size-4" />
        </button>
        <button
          onClick={() => (window as any).api.window.maximize()}
          className="h-full w-10 flex items-center justify-center hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none"
          tabIndex={-1}>
          <FiSquare className="size-3" />
        </button>
        <button
          onClick={() => (window as any).api.window.close()}
          className="h-full w-10 flex items-center justify-center hover:bg-red-500 hover:text-white active:bg-red-600 transition-colors focus:outline-none"
          tabIndex={-1}>
          <FiX className="size-4" />
        </button>
      </div>
    </div>
  );
}
