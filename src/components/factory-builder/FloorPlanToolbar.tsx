import { useRef, useState } from 'react';
import { useModelStore } from '../../stores/modelStore';

export function FloorPlanToolbar() {
  const layout = useModelStore((s) => s.model.layout);
  const setBackgroundImage = useModelStore((s) => s.setBackgroundImage);
  const setBackgroundSettings = useModelStore((s) => s.setBackgroundSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  const hasImage = !!layout.backgroundImage;
  const opacity = layout.backgroundOpacity ?? 0.3;
  const locked = layout.backgroundLocked ?? false;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBackgroundImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 w-full"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Floor Plan
        {hasImage && <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1" />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-100 pt-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.svg"
            className="hidden"
            onChange={handleFile}
          />

          {!hasImage ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              Upload floor plan image
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-500 font-medium">Opacity</label>
                <span className="text-[10px] text-gray-400">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(opacity * 100)}
                onChange={(e) => setBackgroundSettings({ backgroundOpacity: parseInt(e.target.value) / 100 })}
                className="w-full h-1 accent-blue-500"
              />

              <div className="flex gap-1">
                <button
                  onClick={() => setBackgroundSettings({ backgroundLocked: !locked })}
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-medium ${
                    locked ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {locked ? 'Locked' : 'Unlocked'}
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-2 py-1 rounded bg-gray-100 text-[10px] text-gray-600 hover:bg-gray-200"
                >
                  Replace
                </button>
                <button
                  onClick={() => setBackgroundImage(undefined)}
                  className="px-2 py-1 rounded bg-red-50 text-[10px] text-red-600 hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
