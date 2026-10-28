import { useState, useEffect, useCallback, useRef } from 'react';
import { WarehouseProperties } from './WarehouseProperties';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import { ModelSelectorInline } from './ModelLibraryPanel';
import type { Station, Buffer, DistributionConfig, ShiftSchedule } from '../../types';

// ── Validation helpers ──

type ValidationErrors = Record<string, string>;

function useValidation() {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const setError = useCallback((field: string, message: string | null) => {
    setErrors(prev => {
      if (message === null) {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      }
      if (prev[field] === message) return prev;
      return { ...prev, [field]: message };
    });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);

  const hasErrors = Object.keys(errors).length > 0;

  return { errors, setError, clearAll, hasErrors };
}

interface ValidatedNumberInputProps {
  label: string;
  value: number | string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fieldId: string;
  errors: ValidationErrors;
  setError: (field: string, message: string | null) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  placeholder?: string;
  className?: string;
}

function ValidatedNumberInput({
  label,
  value,
  onChange,
  fieldId,
  errors,
  setError,
  min,
  max,
  step,
  integer,
  placeholder,
  className = 'input',
}: ValidatedNumberInputProps) {
  const validate = (val: number | string) => {
    if (val === '' || val === undefined) {
      setError(fieldId, null);
      return;
    }
    const num = Number(val);
    if (isNaN(num)) {
      setError(fieldId, 'Must be a number');
      return;
    }
    if (integer && !Number.isInteger(num)) {
      setError(fieldId, 'Must be a whole number');
      return;
    }
    if (min !== undefined && num < min) {
      setError(fieldId, `Must be >= ${min}`);
      return;
    }
    if (max !== undefined && num > max) {
      setError(fieldId, `Must be <= ${max}`);
      return;
    }
    setError(fieldId, null);
  };

  const error = errors[fieldId];

  return (
    <div>
      <label htmlFor={fieldId} className="input-label">{label}</label>
      <input
        id={fieldId}
        type="number"
        value={value}
        onChange={(e) => {
          validate(e.target.value === '' ? '' : Number(e.target.value));
          onChange(e);
        }}
        onBlur={() => validate(value)}
        min={min}
        max={max}
        step={step ?? (integer ? 1 : undefined)}
        placeholder={placeholder}
        className={`${className}${error ? ' border-red-400' : ''}`}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

interface PropertyPanelProps {
  node: any;
  nodeType: string;
  onUpdate: (updates: any) => void;
  onClose: () => void;
}

interface ValidationProps {
  errors: ValidationErrors;
  setError: (field: string, message: string | null) => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  station: 'Station',
  buffer: 'Buffer',
  source: 'Source',
  sink: 'Sink',
  conveyor: 'Conveyor',
  operator: 'Operator',
  inspection: 'Inspection',
  assembly: 'Assembly',
  disassembly: 'Disassembly',
  splitter: 'Splitter',
  merge: 'Merge',
  palletize: 'Palletize',
  depalletize: 'Depalletize',
  matchbuffer: 'Match Buffer',
  agv: 'AGV',
  roboticcell: 'Robotic Cell',
  humanoid: 'Humanoid',
  warehouse: 'Warehouse',
  loadingdock: 'Loading Dock',
  crane: 'Crane',
  forklift: 'Forklift',
  coldstorage: 'Cold Storage',
  press: 'Press',
  lasercutter: 'Laser Cutter',
  weldingcell: 'Welding Cell',
  paintbooth: 'Paint Booth',
  packager: 'Packager',
  washer: 'Washer',
  cncmachine: 'CNC Machine',
  oven: 'Oven',
  injectionmolder: 'Injection Molder',
  sortingstation: 'Sorting Station',
  accumulator: 'Accumulator',
  turntable: 'Turntable',
  elevator: 'Elevator',
  overheadconveyor: 'Overhead Conveyor',
  sorter: 'Sorter',
  shuttle: 'Shuttle',
  rollerconveyor: 'Roller Conveyor',
  trackguidedvehicle: 'Track Guided Vehicle',
  crossover: 'Crossover',
  pickstation: 'Pick Station',
  weighing: 'Weighing',
  labeler: 'Labeler',
};

export function PropertyPanel({ node, nodeType, onUpdate, onClose }: PropertyPanelProps) {
  const [localNode, setLocalNode] = useState(node);
  const validation = useValidation();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setLibraryModelId = useModelStore((s) => s.setLibraryModelId);

  useEffect(() => {
    setLocalNode(node);
    validation.clearAll();
  }, [node]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  const handleChange = (key: string, value: unknown) => {
    setLocalNode((prev: any) => {
      const next = { ...prev, [key]: value };
      // Debounced auto-save: push to store after 300ms of inactivity
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        if (!validation.hasErrors) onUpdate(next);
      }, 300);
      return next;
    });
  };

  const handleSave = () => {
    if (validation.hasErrors) return;
    // Cancel pending auto-save and apply immediately
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    onUpdate(localNode);
  };

  const label = NODE_TYPE_LABELS[nodeType] || nodeType;

  return (
    <div className="details-panel" style={{
      width: 300,
      background: '#fff',
      borderLeft: '1px solid var(--chrome-border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Panel header — "Details of …" title strip */}
      <div className="dock-panel-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{
            width: 14,
            height: 14,
            borderRadius: 2,
            flexShrink: 0,
            background: nodeType === 'station' ? '#3b82f6'
              : nodeType === 'buffer' ? '#f59e0b'
              : nodeType === 'source' ? '#10b981'
              : nodeType === 'sink' ? '#ef4444'
              : '#6366f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg viewBox="0 0 12 12" fill="none" width="8" height="8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="6" cy="6" r="2.5" />
              <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11" />
            </svg>
          </div>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Details of “{localNode.name || label}”
            <span style={{ fontWeight: 400, color: '#64748B' }}> · {label}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: 3,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

      <div className="space-y-3">
        {/* Common Name field */}
        <div>
          <label htmlFor="property-name" className="input-label">Name</label>
          <input
            id="property-name"
            type="text"
            value={localNode.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="input"
          />
        </div>

        {nodeType === 'station' && (
          <StationProperties station={localNode as Station} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'buffer' && (
          <BufferProperties buffer={localNode as Buffer} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'source' && (
          <SourceProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'sink' && (
          <SinkProperties />
        )}
        {nodeType === 'conveyor' && (
          <ConveyorProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'operator' && (
          <OperatorProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'inspection' && (
          <InspectionProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'assembly' && (
          <AssemblyProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'splitter' && (
          <SplitterProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'merge' && (
          <MergeProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'disassembly' && (
          <DisassemblyProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'palletize' && (
          <PalletizeProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'depalletize' && (
          <DepalletizeProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'matchbuffer' && (
          <MatchBufferProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'agv' && (
          <AGVProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'roboticcell' && (
          <RoboticCellProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'humanoid' && (
          <HumanoidProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'warehouse' && (
          <WarehouseProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'loadingdock' && (
          <LoadingDockProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'crane' && (
          <CraneProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'forklift' && (
          <ForkliftProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'coldstorage' && (localNode.layout || localNode.skus) && (
          <WarehouseProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'coldstorage' && !(localNode.layout || localNode.skus) && (
          <ColdStorageProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'press' && (
          <PressProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'lasercutter' && (
          <LaserCutterProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'weldingcell' && (
          <WeldingCellProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'paintbooth' && (
          <PaintBoothProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'packager' && (
          <PackagerProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'washer' && (
          <WasherProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'cncmachine' && (
          <CNCMachineProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'oven' && (
          <OvenProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'injectionmolder' && (
          <InjectionMolderProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'sortingstation' && (
          <SortingStationProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'accumulator' && (
          <AccumulatorProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'turntable' && (
          <TurntableProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'elevator' && (
          <ElevatorProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'overheadconveyor' && (
          <OverheadConveyorProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'sorter' && (
          <SorterProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'shuttle' && (
          <ShuttleProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'rollerconveyor' && (
          <RollerConveyorProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'trackguidedvehicle' && (
          <TrackGuidedVehicleProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'crossover' && (
          <CrossoverProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'pickstation' && (
          <PickStationProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'weighing' && (
          <WeighingProperties node={localNode} onChange={handleChange} validation={validation} />
        )}
        {nodeType === 'labeler' && (
          <LabelerProperties node={localNode} onChange={handleChange} validation={validation} />
        )}

        {/* 3D Model Library Selector */}
        <ModelSelectorInline
          nodeId={localNode.id || localNode.data?.id}
          currentModelId={localNode.libraryModelId}
          nodeType={nodeType}
          nodeName={localNode.name || localNode.data?.name || nodeType}
          onSelect={(modelId) => {
            setLibraryModelId(localNode.id || localNode.data?.id, modelId);
            setLocalNode({ ...localNode, libraryModelId: modelId });
          }}
        />

        <div style={{ paddingTop: 14, borderTop: '1px solid #f1f5f9', marginTop: 4 }}>
          {validation.hasErrors && (
            <p className="text-xs text-red-500 mb-2">Fix validation errors before saving.</p>
          )}
          <Button onClick={handleSave} disabled={validation.hasErrors} className="w-full">
            Apply Changes
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Station ──
function StationProperties({
  station,
  onChange,
  validation,
}: {
  station: Station;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps & { hasErrors: boolean };
}) {
  const cycleTime = station.cycleTime || { type: 'constant', parameters: { value: 60 } };

  const handleCycleTimeChange = (updates: Partial<DistributionConfig>) => {
    onChange('cycleTime', { ...cycleTime, ...updates });
  };

  return (
    <>
      <div>
        <label htmlFor="station-cycleTimeType" className="input-label">Cycle Time Type</label>
        <select
          id="station-cycleTimeType"
          value={cycleTime.type}
          onChange={(e) => handleCycleTimeChange({ type: e.target.value as DistributionConfig['type'] })}
          className="input"
        >
          <option value="constant">Constant</option>
          <option value="normal">Normal</option>
          <option value="exponential">Exponential</option>
          <option value="triangular">Triangular</option>
        </select>
      </div>

      {cycleTime.type === 'constant' && (
        <ValidatedNumberInput
          label="Cycle Time (seconds)"
          value={Number(cycleTime.parameters?.value) || 60}
          onChange={(e) =>
            handleCycleTimeChange({
              parameters: { value: Number(e.target.value) },
            })
          }
          fieldId="station-cycleTime"
          errors={validation.errors}
          setError={validation.setError}
          min={0.001}
          step={0.1}
        />
      )}

      {cycleTime.type === 'normal' && (
        <>
          <ValidatedNumberInput
            label="Mean (seconds)"
            value={Number(cycleTime.parameters?.mean) || 60}
            onChange={(e) =>
              handleCycleTimeChange({
                parameters: { ...cycleTime.parameters, mean: Number(e.target.value) },
              })
            }
            fieldId="station-cycleTimeMean"
            errors={validation.errors}
            setError={validation.setError}
            min={0.001}
            step={0.1}
          />
          <ValidatedNumberInput
            label="Std Dev (seconds)"
            value={Number(cycleTime.parameters?.std) || 5}
            onChange={(e) =>
              handleCycleTimeChange({
                parameters: { ...cycleTime.parameters, std: Number(e.target.value) },
              })
            }
            fieldId="station-cycleTimeStd"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.1}
          />
        </>
      )}

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Reliability</h4>

        <div className="space-y-3">
          <ValidatedNumberInput
            label="MTBF (hours)"
            value={station.mtbf || ''}
            onChange={(e) => onChange('mtbf', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-mtbf"
            errors={validation.errors}
            setError={validation.setError}
            placeholder="Mean Time Between Failures"
            min={0}
          />

          <ValidatedNumberInput
            label="MTTR (hours)"
            value={station.mttr || ''}
            onChange={(e) => onChange('mttr', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-mttr"
            errors={validation.errors}
            setError={validation.setError}
            placeholder="Mean Time To Repair"
            min={0}
          />

          <ValidatedNumberInput
            label="Scrap Rate (%)"
            value={(station.scrapRate || 0) * 100}
            onChange={(e) => onChange('scrapRate', Number(e.target.value) / 100)}
            fieldId="station-scrapRate"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            max={100}
            step={0.1}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Batch Processing</h4>

        <ValidatedNumberInput
          label="Batch Size"
          value={station.batchSize || 1}
          onChange={(e) => onChange('batchSize', Number(e.target.value))}
          fieldId="station-batchSize"
          errors={validation.errors}
          setError={validation.setError}
          min={1}
          integer
        />
      </div>

      {/* Cost Modeling */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Cost Modeling</h4>
        <div className="grid grid-cols-3 gap-3">
          <ValidatedNumberInput
            label="$/hour"
            value={station.costPerHour || ''}
            onChange={(e) => onChange('costPerHour', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-costPerHour"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.01}
            placeholder="0"
          />
          <ValidatedNumberInput
            label="$/unit"
            value={station.costPerUnit || ''}
            onChange={(e) => onChange('costPerUnit', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-costPerUnit"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.01}
            placeholder="0"
          />
          <ValidatedNumberInput
            label="$/scrap"
            value={station.scrapCostPerUnit || ''}
            onChange={(e) => onChange('scrapCostPerUnit', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-scrapCost"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.01}
            placeholder="0"
          />
        </div>
      </div>

      {/* Energy Modeling */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Energy Modeling</h4>
        <div className="grid grid-cols-3 gap-2">
          <ValidatedNumberInput
            label="kW Idle"
            value={station.energyIdleKw || ''}
            onChange={(e) => onChange('energyIdleKw', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-energyIdleKw"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.1}
            placeholder="0"
          />
          <ValidatedNumberInput
            label="kW Processing"
            value={station.energyProcessingKw || ''}
            onChange={(e) => onChange('energyProcessingKw', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-energyProcessingKw"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.1}
            placeholder="0"
          />
          <ValidatedNumberInput
            label="kW Setup"
            value={station.energySetupKw || ''}
            onChange={(e) => onChange('energySetupKw', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-energySetupKw"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.1}
            placeholder="0"
          />
        </div>
      </div>

      {/* Preventive Maintenance */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Preventive Maintenance</h4>
        <div className="grid grid-cols-3 gap-2">
          <ValidatedNumberInput
            label="PM Interval (hrs)"
            value={station.pmInterval || ''}
            onChange={(e) => onChange('pmInterval', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-pmInterval"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={1}
            placeholder="0"
          />
          <ValidatedNumberInput
            label="PM Duration (hrs)"
            value={station.pmDuration || ''}
            onChange={(e) => onChange('pmDuration', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-pmDuration"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={0.1}
            placeholder="0"
          />
          <ValidatedNumberInput
            label="PM $/event"
            value={station.pmCostPerEvent || ''}
            onChange={(e) => onChange('pmCostPerEvent', e.target.value ? Number(e.target.value) : undefined)}
            fieldId="station-pmCostPerEvent"
            errors={validation.errors}
            setError={validation.setError}
            min={0}
            step={1}
            placeholder="0"
          />
        </div>
      </div>

      {/* Rework */}
      {(station.scrapRate ?? 0) > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Rework</h4>
          <div className="space-y-3">
            <div>
              <label className="input-label">Rework Target Station</label>
              <select
                value={station.reworkTarget || ''}
                onChange={(e) => onChange('reworkTarget', e.target.value || undefined)}
                className="input"
              >
                <option value="">None (scrap all defects)</option>
                {useModelStore.getState().model.stations
                  .filter(s => s.id !== station.id)
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
            </div>
            {station.reworkTarget && (
              <ValidatedNumberInput
                label="Rework Rate (% of defects sent to rework)"
                value={((station.reworkRate || 0) * 100)}
                onChange={(e) => onChange('reworkRate', Number(e.target.value) / 100)}
                fieldId="station-reworkRate"
                errors={validation.errors}
                setError={validation.setError}
                min={0}
                max={100}
                step={1}
              />
            )}
          </div>
        </div>
      )}

      <ShiftConfiguration
        shifts={station.shifts}
        onChange={onChange}
      />

      <PerProductCycleTimes
        productCycleTimes={station.productCycleTimes}
        onChange={onChange}
      />
    </>
  );
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ShiftConfiguration({
  shifts,
  onChange,
}: {
  shifts?: ShiftSchedule[];
  onChange: (key: string, value: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shiftList = shifts || [];

  const updateShift = (index: number, updates: Partial<ShiftSchedule>) => {
    const newShifts = [...shiftList];
    newShifts[index] = { ...newShifts[index], ...updates };
    onChange('shifts', newShifts);
  };

  const addShift = () => {
    const newShift: ShiftSchedule = {
      name: `Shift ${shiftList.length + 1}`,
      startHour: 8,
      endHour: 16,
      days: [0, 1, 2, 3, 4],
    };
    onChange('shifts', [...shiftList, newShift]);
  };

  const removeShift = (index: number) => {
    const newShifts = shiftList.filter((_, i) => i !== index);
    onChange('shifts', newShifts.length > 0 ? newShifts : undefined);
  };

  const toggleDay = (shiftIndex: number, day: number) => {
    const shift = shiftList[shiftIndex];
    const days = shift.days.includes(day)
      ? shift.days.filter((d) => d !== day)
      : [...shift.days, day].sort();
    updateShift(shiftIndex, { days });
  };

  return (
    <div className="border-t border-gray-200 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
      >
        <span>Shift Schedule</span>
        <span className="text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <>
          <p className="text-xs text-gray-400 mb-3">No shifts = 24/7 operation</p>
          <div className="space-y-3">
            {shiftList.map((shift, i) => (
              <div key={i} className="border border-gray-100 rounded p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={shift.name}
                    onChange={(e) => updateShift(i, { name: e.target.value })}
                    className="input text-xs flex-1 mr-2"
                    placeholder="Shift name"
                  />
                  <button
                    onClick={() => removeShift(i)}
                    className="text-red-500 hover:text-red-700 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex space-x-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Start</label>
                    <input
                      type="number"
                      value={shift.startHour}
                      onChange={(e) => updateShift(i, { startHour: Number(e.target.value) })}
                      min={0}
                      max={24}
                      step={0.5}
                      className="input text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">End</label>
                    <input
                      type="number"
                      value={shift.endHour}
                      onChange={(e) => updateShift(i, { endHour: Number(e.target.value) })}
                      min={0}
                      max={24}
                      step={0.5}
                      className="input text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Days</label>
                  <div className="flex space-x-1 mt-1">
                    {DAY_LABELS.map((label, day) => (
                      <button
                        key={day}
                        onClick={() => toggleDay(i, day)}
                        className={`px-1.5 py-0.5 text-[10px] rounded ${
                          shift.days.includes(day)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {shiftList.length < 3 && (
              <button
                onClick={addShift}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                + Add Shift
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PerProductCycleTimes({
  productCycleTimes,
  onChange,
}: {
  productCycleTimes?: Record<string, DistributionConfig>;
  onChange: (key: string, value: unknown) => void;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const [expanded, setExpanded] = useState(false);
  const times = productCycleTimes || {};

  if (products.length === 0) return null;

  return (
    <div className="border-t border-gray-200 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
      >
        <span>Per-Product Cycle Times</span>
        <span className="text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <>
          <p className="text-xs text-gray-400 mb-3">Override cycle time for specific products (optional)</p>
          <div className="space-y-3">
            {products.map(p => {
              const override = times[p.id];
              const hasOverride = override !== undefined;

              return (
                <div key={p.id} className="border border-gray-100 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{p.name}</span>
                    <label className="flex items-center space-x-1">
                      <input
                        type="checkbox"
                        checked={hasOverride}
                        onChange={(e) => {
                          const newTimes = { ...times };
                          if (e.target.checked) {
                            newTimes[p.id] = { type: 'constant', parameters: { value: 60 } };
                          } else {
                            delete newTimes[p.id];
                          }
                          onChange('productCycleTimes', Object.keys(newTimes).length > 0 ? newTimes : undefined);
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className="text-xs text-gray-500">Override</span>
                    </label>
                  </div>
                  {hasOverride && (
                    <div className="flex space-x-2">
                      <select
                        value={override.type}
                        onChange={(e) => {
                          const newTimes = { ...times };
                          newTimes[p.id] = { ...override, type: e.target.value as DistributionConfig['type'] };
                          onChange('productCycleTimes', newTimes);
                        }}
                        className="input text-xs flex-1"
                      >
                        <option value="constant">Constant</option>
                        <option value="normal">Normal</option>
                        <option value="exponential">Exponential</option>
                        <option value="triangular">Triangular</option>
                      </select>
                      <input
                        type="number"
                        value={Number(override.parameters?.value || override.parameters?.mean || 60)}
                        onChange={(e) => {
                          const newTimes = { ...times };
                          const paramKey = override.type === 'normal' ? 'mean' : 'value';
                          newTimes[p.id] = {
                            ...override,
                            parameters: { ...override.parameters, [paramKey]: Number(e.target.value) },
                          };
                          onChange('productCycleTimes', newTimes);
                        }}
                        min={0}
                        step={0.1}
                        className="input text-xs w-20"
                        placeholder="sec"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Buffer ──
function BufferProperties({
  buffer,
  onChange,
  validation,
}: {
  buffer: Buffer;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Capacity"
        value={buffer.capacity}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="buffer-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />

      <div>
        <label className="input-label">Queue Rule</label>
        <select
          value={buffer.queueRule}
          onChange={(e) => onChange('queueRule', e.target.value)}
          className="input"
        >
          <option value="FIFO">FIFO (First In First Out)</option>
          <option value="LIFO">LIFO (Last In First Out)</option>
          <option value="PRIORITY">Priority</option>
        </select>
      </div>

      {/* Kanban Pull System */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center space-x-2 mb-3">
          <input
            type="checkbox"
            id="buffer-kanbanEnabled"
            checked={buffer.kanbanEnabled || false}
            onChange={(e) => onChange('kanbanEnabled', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <label htmlFor="buffer-kanbanEnabled" className="text-sm font-medium text-gray-700">
            Enable Kanban (Pull System)
          </label>
        </div>
        {buffer.kanbanEnabled && (
          <ValidatedNumberInput
            label="Kanban Cards"
            value={buffer.kanbanCards || buffer.capacity}
            onChange={(e) => onChange('kanbanCards', Number(e.target.value))}
            fieldId="buffer-kanbanCards"
            errors={validation.errors}
            setError={validation.setError}
            min={1}
            integer
          />
        )}
      </div>
    </>
  );
}

// ── Source ──
function SourceProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  const feedMode = node.feedMode || 'interval';

  return (
    <>
      <div>
        <label className="input-label">Feed Mode</label>
        <select
          value={feedMode}
          onChange={(e) => onChange('feedMode', e.target.value)}
          className="input"
        >
          <option value="interval">Interval (fixed rate)</option>
          <option value="orders">Orders (from order queue)</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">
          {feedMode === 'interval'
            ? 'Generates parts at a fixed time interval'
            : 'Consumes from the order queue by priority then due date'}
        </p>
      </div>
      {feedMode === 'interval' && (
        <ValidatedNumberInput
          label="Arrival Rate (seconds between arrivals)"
          value={node.arrivalRate || 120}
          onChange={(e) => onChange('arrivalRate', Number(e.target.value))}
          fieldId="source-arrivalRate"
          errors={validation.errors}
          setError={validation.setError}
          min={1}
          step={1}
          integer
        />
      )}
      <div>
        <label className="input-label">Product Filter (optional)</label>
        <SourceProductFilter productFilter={node.productFilter} onChange={onChange} />
      </div>
      {!node.productFilter && (
        <div>
          <ValidatedNumberInput
            label="Product Batch Size"
            value={node.productBatchSize || 1}
            onChange={(e) => onChange('productBatchSize', Math.max(1, Number(e.target.value)))}
            fieldId="source-productBatchSize"
            errors={validation.errors}
            setError={validation.setError}
            min={1}
            step={1}
            integer
          />
          <p className="text-xs text-gray-400 mt-1">Consecutive parts of same type before switching (1 = round-robin)</p>
        </div>
      )}
    </>
  );
}

function SourceProductFilter({ productFilter, onChange }: { productFilter?: string; onChange: (key: string, value: unknown) => void }) {
  const { model } = useModelStore();
  const products = model?.products || [];

  return (
    <>
      <select
        value={productFilter || ''}
        onChange={(e) => onChange('productFilter', e.target.value || undefined)}
        className="input"
      >
        <option value="">All products</option>
        {products.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">Only spawn this product type (leave empty for all)</p>
    </>
  );
}

// ── Sink ──
function SinkProperties() {
  return (
    <p className="text-sm text-gray-500">
      Sink is an exit point for finished products. No additional parameters needed.
    </p>
  );
}

// ── Conveyor ──
function ConveyorProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Length (meters)"
        value={node.length || 10}
        onChange={(e) => onChange('length', Number(e.target.value))}
        fieldId="conveyor-length"
        errors={validation.errors}
        setError={validation.setError}
        min={0.001}
        step={0.5}
      />
      <ValidatedNumberInput
        label="Speed (m/s)"
        value={node.speed || 1}
        onChange={(e) => onChange('speed', Number(e.target.value))}
        fieldId="conveyor-speed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Capacity (items)"
        value={node.capacity || 10}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="conveyor-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <div>
        <label htmlFor="conveyor-accumulationMode" className="input-label">Accumulation Mode</label>
        <select
          id="conveyor-accumulationMode"
          value={node.accumulationMode || 'non-accumulating'}
          onChange={(e) => onChange('accumulationMode', e.target.value)}
          className="input"
        >
          <option value="non-accumulating">Non-Accumulating</option>
          <option value="accumulating">Accumulating</option>
        </select>
      </div>
    </>
  );
}

// ── Operator ──
function OperatorProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Number of Operators"
        value={node.count || 1}
        onChange={(e) => onChange('count', Number(e.target.value))}
        fieldId="operator-count"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Efficiency (%)"
        value={node.efficiency || 100}
        onChange={(e) => onChange('efficiency', Number(e.target.value))}
        fieldId="operator-efficiency"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={100}
        step={1}
      />
      <div>
        <label className="input-label">Skill</label>
        <input
          type="text"
          value={node.skill || 'General'}
          onChange={(e) => onChange('skill', e.target.value)}
          className="input"
          placeholder="e.g., General, Welding, Assembly"
        />
      </div>
    </>
  );
}

// ── Inspection ──
function InspectionProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Inspection Time (seconds)"
        value={node.inspectionTime || 30}
        onChange={(e) => onChange('inspectionTime', Number(e.target.value))}
        fieldId="inspection-time"
        errors={validation.errors}
        setError={validation.setError}
        min={0.001}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Defect Rate (%)"
        value={node.defectRate || 2}
        onChange={(e) => onChange('defectRate', Number(e.target.value))}
        fieldId="inspection-defectRate"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={100}
        step={0.1}
      />
      <div>
        <label className="input-label">Inspection Type</label>
        <select
          value={node.inspectionType || 'visual'}
          onChange={(e) => onChange('inspectionType', e.target.value)}
          className="input"
        >
          <option value="visual">Visual</option>
          <option value="automated">Automated</option>
          <option value="sampling">Sampling</option>
        </select>
      </div>
    </>
  );
}

// ── Assembly ──
function AssemblyProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const hasPerProduct = node.inputPartsByProduct && node.inputPartsByProduct.length > 0;
  const [perProductMode, setPerProductMode] = useState(hasPerProduct);
  const inputPartsByProduct: { productId: string; productName: string; quantity: number }[] = node.inputPartsByProduct || [];

  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (seconds)"
        value={node.cycleTime || 60}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="assembly-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.001}
        step={0.1}
      />
      <div>
        <label className="input-label">Input Mode</label>
        <select
          value={perProductMode ? 'per-product' : 'simple'}
          onChange={(e) => {
            const isPP = e.target.value === 'per-product';
            setPerProductMode(isPP);
            if (!isPP) {
              onChange('inputPartsByProduct', undefined);
            }
          }}
          className="input"
        >
          <option value="simple">Simple (count)</option>
          <option value="per-product">Per-product</option>
        </select>
      </div>
      {!perProductMode ? (
        <div>
          <label className="input-label">Input Parts Required</label>
          <input
            type="number"
            value={node.inputParts || 2}
            onChange={(e) => onChange('inputParts', Number(e.target.value))}
            min={2}
            max={10}
            step={1}
            className="input"
          />
        </div>
      ) : (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Required Parts by Product</h4>
          <div className="space-y-2">
            {inputPartsByProduct.map((part, i) => (
              <div key={i} className="flex items-center space-x-2">
                <select
                  value={part.productId}
                  onChange={(e) => {
                    const product = products.find(p => p.id === e.target.value);
                    const updated = [...inputPartsByProduct];
                    updated[i] = { productId: e.target.value, productName: product?.name || '', quantity: part.quantity };
                    onChange('inputPartsByProduct', updated);
                  }}
                  className="input text-xs flex-1"
                >
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={part.quantity}
                  onChange={(e) => {
                    const updated = [...inputPartsByProduct];
                    updated[i] = { ...part, quantity: Number(e.target.value) };
                    onChange('inputPartsByProduct', updated);
                  }}
                  min={1}
                  step={1}
                  className="input text-xs w-16"
                  placeholder="Qty"
                />
                <button
                  onClick={() => {
                    const updated = inputPartsByProduct.filter((_, idx) => idx !== i);
                    onChange('inputPartsByProduct', updated);
                  }}
                  className="text-red-500 hover:text-red-700 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                onChange('inputPartsByProduct', [
                  ...inputPartsByProduct,
                  { productId: '', productName: '', quantity: 1 },
                ]);
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              + Add required part
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Splitter ──
function SplitterProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const isProductBased = node.splitType === 'product-based';
  const productRouting: Record<string, number> = node.productRouting || {};

  return (
    <>
      <ValidatedNumberInput
        label="Number of Outputs"
        value={node.outputs || 2}
        onChange={(e) => onChange('outputs', Number(e.target.value))}
        fieldId="splitter-outputs"
        errors={validation.errors}
        setError={validation.setError}
        min={2}
        max={5}
        integer
      />
      <div>
        <label className="input-label">Split Type</label>
        <select
          value={node.splitType || 'equal'}
          onChange={(e) => onChange('splitType', e.target.value)}
          className="input"
        >
          <option value="equal">Equal</option>
          <option value="percentage">Percentage</option>
          <option value="conditional">Conditional</option>
          <option value="product-based">Product-Based</option>
        </select>
      </div>
      {isProductBased && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Product Routing</h4>
          <p className="text-xs text-gray-400 mb-2">Map each product to an output port</p>
          {products.length === 0 ? (
            <p className="text-xs text-amber-600">No products defined in model</p>
          ) : (
            <div className="space-y-2">
              {products.map(p => (
                <div key={p.id} className="flex items-center space-x-2">
                  <span className="text-xs text-gray-700 flex-1 truncate">{p.name}</span>
                  <select
                    value={productRouting[p.id] ?? 0}
                    onChange={(e) => {
                      const newRouting = { ...productRouting, [p.id]: Number(e.target.value) };
                      onChange('productRouting', newRouting);
                    }}
                    className="input w-24 text-xs"
                  >
                    {Array.from({ length: node.outputs || 2 }).map((_, i) => (
                      <option key={i} value={i}>Output {i + 1}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Merge ──
function MergeProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Number of Inputs"
        value={node.inputs || 2}
        onChange={(e) => onChange('inputs', Number(e.target.value))}
        fieldId="merge-inputs"
        errors={validation.errors}
        setError={validation.setError}
        min={2}
        max={5}
        integer
      />
      <div>
        <label className="input-label">Merge Type</label>
        <select
          value={node.mergeType || 'fifo'}
          onChange={(e) => onChange('mergeType', e.target.value)}
          className="input"
        >
          <option value="fifo">FIFO (First In First Out)</option>
          <option value="priority">Priority</option>
          <option value="alternating">Alternating</option>
        </select>
      </div>
    </>
  );
}

// ── Disassembly ──
function DisassemblyProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const outputParts: { productId: string; productName: string; quantity: number }[] = node.outputParts || [];

  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (seconds)"
        value={node.cycleTime || 30}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="disassembly-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.001}
        step={0.1}
      />
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Output Parts</h4>
        <div className="space-y-2">
          {outputParts.map((part, i) => (
            <div key={i} className="flex items-center space-x-2">
              <select
                value={part.productId}
                onChange={(e) => {
                  const product = products.find(p => p.id === e.target.value);
                  const updated = [...outputParts];
                  updated[i] = { productId: e.target.value, productName: product?.name || '', quantity: part.quantity };
                  onChange('outputParts', updated);
                }}
                className="input text-xs flex-1"
              >
                <option value="">Select product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="number"
                value={part.quantity}
                onChange={(e) => {
                  const updated = [...outputParts];
                  updated[i] = { ...part, quantity: Number(e.target.value) };
                  onChange('outputParts', updated);
                }}
                min={1}
                step={1}
                className="input text-xs w-16"
                placeholder="Qty"
              />
              <button
                onClick={() => {
                  onChange('outputParts', outputParts.filter((_, idx) => idx !== i));
                }}
                className="text-red-500 hover:text-red-700 text-xs px-1"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              onChange('outputParts', [...outputParts, { productId: '', productName: '', quantity: 1 }]);
            }}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            + Add output part
          </button>
        </div>
      </div>
    </>
  );
}

// ── Palletize ──
function PalletizeProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const palletSizeByProduct: Record<string, number> = node.palletSizeByProduct || {};

  return (
    <>
      <div>
        <ValidatedNumberInput
          label="Default Pallet Size (items per pallet)"
          value={node.defaultPalletSize || 10}
          onChange={(e) => onChange('defaultPalletSize', Number(e.target.value))}
          fieldId="palletize-defaultSize"
          errors={validation.errors}
          setError={validation.setError}
          min={1}
          integer
        />
        <p className="text-xs text-gray-400 mt-1">Used when no per-product size is set</p>
      </div>
      <ValidatedNumberInput
        label="Cycle Time (seconds)"
        value={node.cycleTime || 15}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="palletize-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.001}
        step={0.1}
      />
      {products.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Pallet Size by Product</h4>
          <p className="text-xs text-gray-400 mb-3">Override pallet size for specific products</p>
          <div className="space-y-2">
            {products.map(p => {
              const hasOverride = palletSizeByProduct[p.id] !== undefined;
              return (
                <div key={p.id} className="flex items-center space-x-2">
                  <label className="flex items-center space-x-1 flex-1">
                    <input
                      type="checkbox"
                      checked={hasOverride}
                      onChange={(e) => {
                        const updated = { ...palletSizeByProduct };
                        if (e.target.checked) {
                          updated[p.id] = node.defaultPalletSize || 10;
                        } else {
                          delete updated[p.id];
                        }
                        onChange('palletSizeByProduct', Object.keys(updated).length > 0 ? updated : undefined);
                      }}
                      className="rounded text-amber-600"
                    />
                    <span className="text-xs text-gray-700 truncate">{p.name}</span>
                  </label>
                  {hasOverride && (
                    <input
                      type="number"
                      value={palletSizeByProduct[p.id]}
                      onChange={(e) => {
                        const updated = { ...palletSizeByProduct, [p.id]: Number(e.target.value) };
                        onChange('palletSizeByProduct', updated);
                      }}
                      min={1}
                      step={1}
                      className="input text-xs w-20"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Depalletize ──
function DepalletizeProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
        <p className="text-xs text-yellow-800 font-medium">Unloads pallet until empty</p>
        <p className="text-xs text-yellow-600 mt-1">
          Automatically unpacks all items from incoming pallets. No pallet size needed.
        </p>
      </div>
      <div>
        <ValidatedNumberInput
          label="Cycle Time per Item (seconds)"
          value={node.cycleTime || 5}
          onChange={(e) => onChange('cycleTime', Number(e.target.value))}
          fieldId="depalletize-cycleTime"
          errors={validation.errors}
          setError={validation.setError}
          min={0.1}
          step={0.1}
        />
        <p className="text-xs text-gray-400 mt-1">Time to unload each individual item from the pallet</p>
      </div>
    </>
  );
}

// ── Match Buffer ──
function MatchBufferProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const requiredParts: { productId: string; productName: string; quantity: number }[] = node.requiredParts || [];

  return (
    <>
      <ValidatedNumberInput
        label="Capacity"
        value={node.capacity || 20}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="matchbuffer-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <div>
        <label className="input-label">Match Key</label>
        <select
          value={node.matchKey || 'order'}
          onChange={(e) => onChange('matchKey', e.target.value)}
          className="input"
        >
          <option value="order">Order</option>
          <option value="batch">Batch</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Timeout (seconds, optional)"
        value={node.timeout || ''}
        onChange={(e) => onChange('timeout', e.target.value ? Number(e.target.value) : undefined)}
        fieldId="matchbuffer-timeout"
        errors={validation.errors}
        setError={validation.setError}
        placeholder="No timeout"
        min={0}
      />
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Required Parts</h4>
        <div className="space-y-2">
          {requiredParts.map((part, i) => (
            <div key={i} className="flex items-center space-x-2">
              <select
                value={part.productId}
                onChange={(e) => {
                  const product = products.find(p => p.id === e.target.value);
                  const updated = [...requiredParts];
                  updated[i] = { productId: e.target.value, productName: product?.name || '', quantity: part.quantity };
                  onChange('requiredParts', updated);
                }}
                className="input text-xs flex-1"
              >
                <option value="">Select product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="number"
                value={part.quantity}
                onChange={(e) => {
                  const updated = [...requiredParts];
                  updated[i] = { ...part, quantity: Number(e.target.value) };
                  onChange('requiredParts', updated);
                }}
                min={1}
                step={1}
                className="input text-xs w-16"
                placeholder="Qty"
              />
              <button
                onClick={() => {
                  onChange('requiredParts', requiredParts.filter((_, idx) => idx !== i));
                }}
                className="text-red-500 hover:text-red-700 text-xs px-1"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              onChange('requiredParts', [...requiredParts, { productId: '', productName: '', quantity: 1 }]);
            }}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            + Add required part
          </button>
        </div>
      </div>
    </>
  );
}

// ── AGV ──
function AGVProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Number of AGVs"
        value={node.count || 1}
        onChange={(e) => onChange('count', Number(e.target.value))}
        fieldId="agv-count"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Speed (m/s)"
        value={node.speed ?? 1.5}
        onChange={(e) => onChange('speed', Number(e.target.value))}
        fieldId="agv-speed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Capacity (items)"
        value={node.capacity || 1}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="agv-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
    </>
  );
}

// ── Robotic Cell ──
function RoboticCellProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s)"
        value={node.cycleTime || 30}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="roboticcell-cycletime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <div>
        <label className="input-label">Program</label>
        <input
          type="text"
          value={node.program || ''}
          onChange={(e) => onChange('program', e.target.value)}
          className="input"
          placeholder="e.g., Weld-01, Pick-Place"
        />
      </div>
    </>
  );
}

// ── Humanoid ──
function HumanoidProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Number of Humanoids"
        value={node.count || 1}
        onChange={(e) => onChange('count', Number(e.target.value))}
        fieldId="humanoid-count"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Efficiency (%)"
        value={node.efficiency || 100}
        onChange={(e) => onChange('efficiency', Number(e.target.value))}
        fieldId="humanoid-efficiency"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={100}
        step={1}
      />
      <div>
        <label className="input-label">Skill</label>
        <input
          type="text"
          value={node.skill || 'General'}
          onChange={(e) => onChange('skill', e.target.value)}
          className="input"
          placeholder="e.g., General, Assembly, Inspection"
        />
      </div>
    </>
  );
}

// ── Warehouse ──
// ── Loading Dock ──
function LoadingDockProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Dock Count"
        value={node.dockCount ?? 2}
        onChange={(e) => onChange('dockCount', Number(e.target.value))}
        fieldId="loadingdock-dockCount"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Load Time (s)"
        value={node.loadTime ?? 600}
        onChange={(e) => onChange('loadTime', Number(e.target.value))}
        fieldId="loadingdock-loadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Unload Time (s)"
        value={node.unloadTime ?? 600}
        onChange={(e) => onChange('unloadTime', Number(e.target.value))}
        fieldId="loadingdock-unloadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Truck Arrival Rate (s)"
        value={node.truckArrivalRate ?? 3600}
        onChange={(e) => onChange('truckArrivalRate', Number(e.target.value))}
        fieldId="loadingdock-truckArrivalRate"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <div>
        <label className="input-label">Mode</label>
        <select className="input" value={node.mode ?? 'both'} onChange={(e) => onChange('mode', e.target.value)}>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
          <option value="both">Both</option>
        </select>
      </div>
    </>
  );
}

// ── Crane ──
function CraneProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <div>
        <label className="input-label">Crane Type</label>
        <select className="input" value={node.craneType ?? 'gantry'} onChange={(e) => onChange('craneType', e.target.value)}>
          <option value="gantry">Gantry</option>
          <option value="bridge">Bridge</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Lift Capacity (kg)"
        value={node.liftCapacity ?? 5000}
        onChange={(e) => onChange('liftCapacity', Number(e.target.value))}
        fieldId="crane-liftCapacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Travel Speed (m/s)"
        value={node.travelSpeed ?? 1.0}
        onChange={(e) => onChange('travelSpeed', Number(e.target.value))}
        fieldId="crane-travelSpeed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Lift Speed (m/s)"
        value={node.liftSpeed ?? 0.5}
        onChange={(e) => onChange('liftSpeed', Number(e.target.value))}
        fieldId="crane-liftSpeed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Span Width (m)"
        value={node.spanWidth ?? 10}
        onChange={(e) => onChange('spanWidth', Number(e.target.value))}
        fieldId="crane-spanWidth"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
    </>
  );
}

// ── Forklift ──
function ForkliftProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Count"
        value={node.count ?? 1}
        onChange={(e) => onChange('count', Number(e.target.value))}
        fieldId="forklift-count"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Lift Capacity (kg)"
        value={node.liftCapacity ?? 2000}
        onChange={(e) => onChange('liftCapacity', Number(e.target.value))}
        fieldId="forklift-liftCapacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Speed (m/s)"
        value={node.speed ?? 2.0}
        onChange={(e) => onChange('speed', Number(e.target.value))}
        fieldId="forklift-speed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Lift Height (m)"
        value={node.liftHeight ?? 5}
        onChange={(e) => onChange('liftHeight', Number(e.target.value))}
        fieldId="forklift-liftHeight"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
    </>
  );
}

// ── Cold Storage ──
function ColdStorageProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Capacity"
        value={node.capacity ?? 200}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="coldstorage-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Temperature (\u00B0C)"
        value={node.temperature ?? -20}
        onChange={(e) => onChange('temperature', Number(e.target.value))}
        fieldId="coldstorage-temperature"
        errors={validation.errors}
        setError={validation.setError}
        min={-60}
        max={10}
      />
      <ValidatedNumberInput
        label="Put Time (s)"
        value={node.putTime ?? 45}
        onChange={(e) => onChange('putTime', Number(e.target.value))}
        fieldId="coldstorage-putTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Pick Time (s)"
        value={node.pickTime ?? 30}
        onChange={(e) => onChange('pickTime', Number(e.target.value))}
        fieldId="coldstorage-pickTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
    </>
  );
}

// ── Press ──
function PressProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s)"
        value={node.cycleTime ?? 15}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="press-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Tonnage (tons)"
        value={node.tonnage ?? 200}
        onChange={(e) => onChange('tonnage', Number(e.target.value))}
        fieldId="press-tonnage"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Setup Time (s)"
        value={node.setupTime ?? 300}
        onChange={(e) => onChange('setupTime', Number(e.target.value))}
        fieldId="press-setupTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
      />
      <ValidatedNumberInput
        label="Scrap Rate"
        value={node.scrapRate ?? 0.02}
        onChange={(e) => onChange('scrapRate', Number(e.target.value))}
        fieldId="press-scrapRate"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={1}
        step={0.01}
      />
    </>
  );
}

// ── Laser Cutter ──
function LaserCutterProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s)"
        value={node.cycleTime ?? 60}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="lasercutter-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <div>
        <label className="input-label">Sheet Size</label>
        <input
          type="text"
          className="input"
          value={node.sheetSize ?? '1500x3000'}
          onChange={(e) => onChange('sheetSize', e.target.value)}
        />
      </div>
      <ValidatedNumberInput
        label="Laser Power (W)"
        value={node.laserPower ?? 4000}
        onChange={(e) => onChange('laserPower', Number(e.target.value))}
        fieldId="lasercutter-laserPower"
        errors={validation.errors}
        setError={validation.setError}
        min={100}
      />
      <ValidatedNumberInput
        label="Setup Time (s)"
        value={node.setupTime ?? 120}
        onChange={(e) => onChange('setupTime', Number(e.target.value))}
        fieldId="lasercutter-setupTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
      />
    </>
  );
}

// ── Welding Cell ──
function WeldingCellProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s)"
        value={node.cycleTime ?? 45}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="weldingcell-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <div>
        <label className="input-label">Weld Type</label>
        <select className="input" value={node.weldType ?? 'MIG'} onChange={(e) => onChange('weldType', e.target.value)}>
          <option value="MIG">MIG</option>
          <option value="TIG">TIG</option>
          <option value="spot">Spot</option>
          <option value="laser">Laser</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Fixture Count"
        value={node.fixtureCount ?? 2}
        onChange={(e) => onChange('fixtureCount', Number(e.target.value))}
        fieldId="weldingcell-fixtureCount"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Setup Time (s)"
        value={node.setupTime ?? 180}
        onChange={(e) => onChange('setupTime', Number(e.target.value))}
        fieldId="weldingcell-setupTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
      />
    </>
  );
}

// ── Paint Booth ──
function PaintBoothProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s spray)"
        value={node.cycleTime ?? 120}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="paintbooth-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Cure Time (s)"
        value={node.cureTime ?? 600}
        onChange={(e) => onChange('cureTime', Number(e.target.value))}
        fieldId="paintbooth-cureTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <div>
        <label className="input-label">Booth Type</label>
        <select className="input" value={node.boothType ?? 'spray'} onChange={(e) => onChange('boothType', e.target.value)}>
          <option value="spray">Spray</option>
          <option value="powder">Powder</option>
          <option value="dip">Dip</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Batch Size"
        value={node.batchSize ?? 1}
        onChange={(e) => onChange('batchSize', Number(e.target.value))}
        fieldId="paintbooth-batchSize"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
    </>
  );
}

// ── Packager ──
function PackagerProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s)"
        value={node.cycleTime ?? 10}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="packager-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <div>
        <label className="input-label">Pack Type</label>
        <select className="input" value={node.packType ?? 'boxing'} onChange={(e) => onChange('packType', e.target.value)}>
          <option value="shrinkwrap">Shrinkwrap</option>
          <option value="stretchwrap">Stretchwrap</option>
          <option value="boxing">Boxing</option>
          <option value="banding">Banding</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Units Per Pack"
        value={node.unitsPerPack ?? 1}
        onChange={(e) => onChange('unitsPerPack', Number(e.target.value))}
        fieldId="packager-unitsPerPack"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
    </>
  );
}

// ── Washer ──
function WasherProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s batch)"
        value={node.cycleTime ?? 300}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="washer-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Batch Size"
        value={node.batchSize ?? 20}
        onChange={(e) => onChange('batchSize', Number(e.target.value))}
        fieldId="washer-batchSize"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <div>
        <label className="input-label">Wash Type</label>
        <select className="input" value={node.washType ?? 'aqueous'} onChange={(e) => onChange('washType', e.target.value)}>
          <option value="aqueous">Aqueous</option>
          <option value="solvent">Solvent</option>
          <option value="ultrasonic">Ultrasonic</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Temperature (\u00B0C)"
        value={node.temperature ?? 60}
        onChange={(e) => onChange('temperature', Number(e.target.value))}
        fieldId="washer-temperature"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={100}
      />
    </>
  );
}

// ── CNC Machine ──
function CNCMachineProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <div>
        <label className="input-label">Machine Type</label>
        <select className="input" value={node.machineType ?? 'mill'} onChange={(e) => onChange('machineType', e.target.value)}>
          <option value="lathe">Lathe</option>
          <option value="mill">Mill</option>
          <option value="grinder">Grinder</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Cycle Time (s)"
        value={node.cycleTime ?? 45}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="cncmachine-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Tool Change Time (s)"
        value={node.toolChangeTime ?? 12}
        onChange={(e) => onChange('toolChangeTime', Number(e.target.value))}
        fieldId="cncmachine-toolChangeTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
      />
      <ValidatedNumberInput
        label="Spindle Speed (RPM)"
        value={node.spindleSpeed ?? 8000}
        onChange={(e) => onChange('spindleSpeed', Number(e.target.value))}
        fieldId="cncmachine-spindleSpeed"
        errors={validation.errors}
        setError={validation.setError}
        min={100}
      />
    </>
  );
}

// ── Oven ──
function OvenProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Ramp-Up Time (s)"
        value={node.rampUpTime ?? 300}
        onChange={(e) => onChange('rampUpTime', Number(e.target.value))}
        fieldId="oven-rampUpTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Hold Time (s)"
        value={node.holdTime ?? 1800}
        onChange={(e) => onChange('holdTime', Number(e.target.value))}
        fieldId="oven-holdTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Cool-Down Time (s)"
        value={node.coolDownTime ?? 600}
        onChange={(e) => onChange('coolDownTime', Number(e.target.value))}
        fieldId="oven-coolDownTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Batch Size"
        value={node.batchSize ?? 20}
        onChange={(e) => onChange('batchSize', Number(e.target.value))}
        fieldId="oven-batchSize"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Temperature (&deg;C)"
        value={node.temperature ?? 200}
        onChange={(e) => onChange('temperature', Number(e.target.value))}
        fieldId="oven-temperature"
        errors={validation.errors}
        setError={validation.setError}
        min={50}
        max={1200}
      />
    </>
  );
}

// ── Injection Molder ──
function InjectionMolderProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Cycle Time (s)"
        value={node.cycleTime ?? 30}
        onChange={(e) => onChange('cycleTime', Number(e.target.value))}
        fieldId="injectionmolder-cycleTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Cavity Count"
        value={node.cavityCount ?? 4}
        onChange={(e) => onChange('cavityCount', Number(e.target.value))}
        fieldId="injectionmolder-cavityCount"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        max={64}
        integer
      />
      <ValidatedNumberInput
        label="Cooling Time (s)"
        value={node.coolingTime ?? 15}
        onChange={(e) => onChange('coolingTime', Number(e.target.value))}
        fieldId="injectionmolder-coolingTime"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
      <ValidatedNumberInput
        label="Clamp Force (tons)"
        value={node.clampForce ?? 250}
        onChange={(e) => onChange('clampForce', Number(e.target.value))}
        fieldId="injectionmolder-clampForce"
        errors={validation.errors}
        setError={validation.setError}
        min={10}
      />
    </>
  );
}

// ── Sorting Station ──
function SortingStationProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Output Lanes"
        value={node.outputs ?? 3}
        onChange={(e) => onChange('outputs', Number(e.target.value))}
        fieldId="sortingstation-outputs"
        errors={validation.errors}
        setError={validation.setError}
        min={2}
        max={6}
        integer
      />
      <div>
        <label className="input-label">Sort Mode</label>
        <select className="input" value={node.sortMode ?? 'barcode'} onChange={(e) => onChange('sortMode', e.target.value)}>
          <option value="barcode">Barcode</option>
          <option value="weight">Weight</option>
          <option value="vision">Vision</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Scan Time (s)"
        value={node.scanTime ?? 0.5}
        onChange={(e) => onChange('scanTime', Number(e.target.value))}
        fieldId="sortingstation-scanTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
      />
      <ValidatedNumberInput
        label="Divert Speed (items/min)"
        value={node.divertSpeed ?? 60}
        onChange={(e) => onChange('divertSpeed', Number(e.target.value))}
        fieldId="sortingstation-divertSpeed"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
    </>
  );
}

// ── Accumulator ──
function AccumulatorProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <div>
        <label className="input-label">Mode</label>
        <select className="input" value={node.mode ?? 'batch'} onChange={(e) => onChange('mode', e.target.value)}>
          <option value="fifo">FIFO (continuous)</option>
          <option value="batch">Batch (burst release)</option>
        </select>
      </div>
      <ValidatedNumberInput
        label="Capacity (items)"
        value={node.capacity ?? 50}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="accumulator-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Release Size"
        value={node.releaseSize ?? 10}
        onChange={(e) => onChange('releaseSize', Number(e.target.value))}
        fieldId="accumulator-releaseSize"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Release Interval (s)"
        value={node.releaseInterval ?? 60}
        onChange={(e) => onChange('releaseInterval', Number(e.target.value))}
        fieldId="accumulator-releaseInterval"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
    </>
  );
}

// ── Turntable ──
function TurntableProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Rotation Time (s)"
        value={node.rotationTime ?? 3}
        onChange={(e) => onChange('rotationTime', Number(e.target.value))}
        fieldId="turntable-rotationTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Transfer Time (s)"
        value={node.transferTime ?? 2}
        onChange={(e) => onChange('transferTime', Number(e.target.value))}
        fieldId="turntable-transferTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Positions"
        value={node.positions ?? 4}
        onChange={(e) => onChange('positions', Number(e.target.value))}
        fieldId="turntable-positions"
        errors={validation.errors}
        setError={validation.setError}
        min={2}
        max={8}
        integer
      />
    </>
  );
}

// ── Elevator ──
function ElevatorProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Load Time (s)"
        value={node.loadTime ?? 5}
        onChange={(e) => onChange('loadTime', Number(e.target.value))}
        fieldId="elevator-loadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Unload Time (s)"
        value={node.unloadTime ?? 5}
        onChange={(e) => onChange('unloadTime', Number(e.target.value))}
        fieldId="elevator-unloadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Travel Speed (m/s)"
        value={node.travelSpeed ?? 1.0}
        onChange={(e) => onChange('travelSpeed', Number(e.target.value))}
        fieldId="elevator-travelSpeed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Floors"
        value={node.floors ?? 2}
        onChange={(e) => onChange('floors', Number(e.target.value))}
        fieldId="elevator-floors"
        errors={validation.errors}
        setError={validation.setError}
        min={2}
        integer
      />
      <ValidatedNumberInput
        label="Floor Height (m)"
        value={node.floorHeight ?? 3}
        onChange={(e) => onChange('floorHeight', Number(e.target.value))}
        fieldId="elevator-floorHeight"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        step={0.5}
      />
    </>
  );
}

// ── Overhead Conveyor ──
function OverheadConveyorProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Carrier Count"
        value={node.carrierCount ?? 10}
        onChange={(e) => onChange('carrierCount', Number(e.target.value))}
        fieldId="overheadconveyor-carrierCount"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Carrier Speed (m/s)"
        value={node.carrierSpeed ?? 0.5}
        onChange={(e) => onChange('carrierSpeed', Number(e.target.value))}
        fieldId="overheadconveyor-carrierSpeed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Load Time (s)"
        value={node.loadTime ?? 5}
        onChange={(e) => onChange('loadTime', Number(e.target.value))}
        fieldId="overheadconveyor-loadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Unload Time (s)"
        value={node.unloadTime ?? 5}
        onChange={(e) => onChange('unloadTime', Number(e.target.value))}
        fieldId="overheadconveyor-unloadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Track Length (m)"
        value={node.trackLength ?? 50}
        onChange={(e) => onChange('trackLength', Number(e.target.value))}
        fieldId="overheadconveyor-trackLength"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
    </>
  );
}

// ── Sorter ──
function SorterProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Sort Delay (s)"
        value={node.sortDelay ?? 1}
        onChange={(e) => onChange('sortDelay', Number(e.target.value))}
        fieldId="sorter-sortDelay"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Error Rate (0–1)"
        value={node.errorRate ?? 0.01}
        onChange={(e) => onChange('errorRate', Number(e.target.value))}
        fieldId="sorter-errorRate"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={1}
        step={0.01}
      />
      <ValidatedNumberInput
        label="Outputs"
        value={node.outputs ?? 3}
        onChange={(e) => onChange('outputs', Number(e.target.value))}
        fieldId="sorter-outputs"
        errors={validation.errors}
        setError={validation.setError}
        min={2}
        integer
      />
    </>
  );
}

// ── Shuttle ──
function ShuttleProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Travel Speed (m/s)"
        value={node.travelSpeed ?? 2.0}
        onChange={(e) => onChange('travelSpeed', Number(e.target.value))}
        fieldId="shuttle-travelSpeed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Lane Count"
        value={node.laneCount ?? 4}
        onChange={(e) => onChange('laneCount', Number(e.target.value))}
        fieldId="shuttle-laneCount"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Load Time (s)"
        value={node.loadTime ?? 3}
        onChange={(e) => onChange('loadTime', Number(e.target.value))}
        fieldId="shuttle-loadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Unload Time (s)"
        value={node.unloadTime ?? 3}
        onChange={(e) => onChange('unloadTime', Number(e.target.value))}
        fieldId="shuttle-unloadTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
    </>
  );
}

// ── Roller Conveyor ──
function RollerConveyorProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Length (m)"
        value={node.length ?? 10}
        onChange={(e) => onChange('length', Number(e.target.value))}
        fieldId="rollerconveyor-length"
        errors={validation.errors}
        setError={validation.setError}
        min={0.5}
        step={0.5}
      />
      <ValidatedNumberInput
        label="Speed (m/s)"
        value={node.speed ?? 0.5}
        onChange={(e) => onChange('speed', Number(e.target.value))}
        fieldId="rollerconveyor-speed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Capacity (items)"
        value={node.capacity ?? 20}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="rollerconveyor-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
    </>
  );
}

// ── Track Guided Vehicle ──
function TrackGuidedVehicleProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Count"
        value={node.count ?? 3}
        onChange={(e) => onChange('count', Number(e.target.value))}
        fieldId="trackguidedvehicle-count"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Speed (m/s)"
        value={node.speed ?? 1.5}
        onChange={(e) => onChange('speed', Number(e.target.value))}
        fieldId="trackguidedvehicle-speed"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Capacity (items)"
        value={node.capacity ?? 1}
        onChange={(e) => onChange('capacity', Number(e.target.value))}
        fieldId="trackguidedvehicle-capacity"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Track Length (m)"
        value={node.trackLength ?? 100}
        onChange={(e) => onChange('trackLength', Number(e.target.value))}
        fieldId="trackguidedvehicle-trackLength"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
      />
    </>
  );
}

// ── Crossover ──
function CrossoverProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Transfer Time (s)"
        value={node.transferTime ?? 2}
        onChange={(e) => onChange('transferTime', Number(e.target.value))}
        fieldId="crossover-transferTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Lane Count"
        value={node.laneCount ?? 2}
        onChange={(e) => onChange('laneCount', Number(e.target.value))}
        fieldId="crossover-laneCount"
        errors={validation.errors}
        setError={validation.setError}
        min={2}
        integer
      />
    </>
  );
}

// ── Pick Station ──
function PickStationProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Picker Count"
        value={node.pickerCount ?? 1}
        onChange={(e) => onChange('pickerCount', Number(e.target.value))}
        fieldId="pickstation-pickerCount"
        errors={validation.errors}
        setError={validation.setError}
        min={1}
        integer
      />
      <ValidatedNumberInput
        label="Pick Time (s)"
        value={node.pickTime ?? 5}
        onChange={(e) => onChange('pickTime', Number(e.target.value))}
        fieldId="pickstation-pickTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Error Rate (0–1)"
        value={node.errorRate ?? 0.02}
        onChange={(e) => onChange('errorRate', Number(e.target.value))}
        fieldId="pickstation-errorRate"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={1}
        step={0.01}
      />
    </>
  );
}

// ── Weighing ──
function WeighingProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Measure Time (s)"
        value={node.measureTime ?? 3}
        onChange={(e) => onChange('measureTime', Number(e.target.value))}
        fieldId="weighing-measureTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Reject Rate (0–1)"
        value={node.rejectRate ?? 0.05}
        onChange={(e) => onChange('rejectRate', Number(e.target.value))}
        fieldId="weighing-rejectRate"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={1}
        step={0.01}
      />
    </>
  );
}

// ── Labeler ──
function LabelerProperties({
  node,
  onChange,
  validation,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
  validation: ValidationProps;
}) {
  return (
    <>
      <ValidatedNumberInput
        label="Label Time (s)"
        value={node.labelTime ?? 2}
        onChange={(e) => onChange('labelTime', Number(e.target.value))}
        fieldId="labeler-labelTime"
        errors={validation.errors}
        setError={validation.setError}
        min={0.1}
        step={0.1}
      />
      <ValidatedNumberInput
        label="Error Rate (0–1)"
        value={node.errorRate ?? 0.01}
        onChange={(e) => onChange('errorRate', Number(e.target.value))}
        fieldId="labeler-errorRate"
        errors={validation.errors}
        setError={validation.setError}
        min={0}
        max={1}
        step={0.01}
      />
    </>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
