import { useState, useEffect } from 'react';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import type { Station, Buffer, DistributionConfig, ShiftSchedule } from '../../types';

interface PropertyPanelProps {
  node: any;
  nodeType: string;
  onUpdate: (updates: any) => void;
  onClose: () => void;
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
};

export function PropertyPanel({ node, nodeType, onUpdate, onClose }: PropertyPanelProps) {
  const [localNode, setLocalNode] = useState(node);

  useEffect(() => {
    setLocalNode(node);
  }, [node]);

  const handleChange = (key: string, value: unknown) => {
    setLocalNode((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate(localNode);
  };

  const label = NODE_TYPE_LABELS[nodeType] || nodeType;

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          {label} Properties
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <CloseIcon className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Common Name field */}
        <div>
          <label className="input-label">Name</label>
          <input
            type="text"
            value={localNode.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="input"
          />
        </div>

        {nodeType === 'station' && (
          <StationProperties station={localNode as Station} onChange={handleChange} />
        )}
        {nodeType === 'buffer' && (
          <BufferProperties buffer={localNode as Buffer} onChange={handleChange} />
        )}
        {nodeType === 'source' && (
          <SourceProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'sink' && (
          <SinkProperties />
        )}
        {nodeType === 'conveyor' && (
          <ConveyorProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'operator' && (
          <OperatorProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'inspection' && (
          <InspectionProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'assembly' && (
          <AssemblyProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'splitter' && (
          <SplitterProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'merge' && (
          <MergeProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'disassembly' && (
          <DisassemblyProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'palletize' && (
          <PalletizeProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'depalletize' && (
          <DepalletizeProperties node={localNode} onChange={handleChange} />
        )}
        {nodeType === 'matchbuffer' && (
          <MatchBufferProperties node={localNode} onChange={handleChange} />
        )}

        <div className="pt-4 border-t border-gray-200">
          <Button onClick={handleSave} className="w-full">
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Station ──
function StationProperties({
  station,
  onChange,
}: {
  station: Station;
  onChange: (key: string, value: unknown) => void;
}) {
  const cycleTime = station.cycleTime || { type: 'constant', parameters: { value: 60 } };

  const handleCycleTimeChange = (updates: Partial<DistributionConfig>) => {
    onChange('cycleTime', { ...cycleTime, ...updates });
  };

  return (
    <>
      <div>
        <label className="input-label">Cycle Time Type</label>
        <select
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
        <div>
          <label className="input-label">Cycle Time (seconds)</label>
          <input
            type="number"
            value={Number(cycleTime.parameters?.value) || 60}
            onChange={(e) =>
              handleCycleTimeChange({
                parameters: { value: Number(e.target.value) },
              })
            }
            min={0}
            step={0.1}
            className="input"
          />
        </div>
      )}

      {cycleTime.type === 'normal' && (
        <>
          <div>
            <label className="input-label">Mean (seconds)</label>
            <input
              type="number"
              value={Number(cycleTime.parameters?.mean) || 60}
              onChange={(e) =>
                handleCycleTimeChange({
                  parameters: { ...cycleTime.parameters, mean: Number(e.target.value) },
                })
              }
              min={0}
              className="input"
            />
          </div>
          <div>
            <label className="input-label">Std Dev (seconds)</label>
            <input
              type="number"
              value={Number(cycleTime.parameters?.std) || 5}
              onChange={(e) =>
                handleCycleTimeChange({
                  parameters: { ...cycleTime.parameters, std: Number(e.target.value) },
                })
              }
              min={0}
              className="input"
            />
          </div>
        </>
      )}

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Reliability</h4>

        <div className="space-y-3">
          <div>
            <label className="input-label">MTBF (hours)</label>
            <input
              type="number"
              value={station.mtbf || ''}
              onChange={(e) => onChange('mtbf', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Mean Time Between Failures"
              min={0}
              className="input"
            />
          </div>

          <div>
            <label className="input-label">MTTR (hours)</label>
            <input
              type="number"
              value={station.mttr || ''}
              onChange={(e) => onChange('mttr', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Mean Time To Repair"
              min={0}
              className="input"
            />
          </div>

          <div>
            <label className="input-label">Scrap Rate (%)</label>
            <input
              type="number"
              value={(station.scrapRate || 0) * 100}
              onChange={(e) => onChange('scrapRate', Number(e.target.value) / 100)}
              min={0}
              max={100}
              step={0.1}
              className="input"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Batch Processing</h4>

        <div>
          <label className="input-label">Batch Size</label>
          <input
            type="number"
            value={station.batchSize || 1}
            onChange={(e) => onChange('batchSize', Number(e.target.value))}
            min={1}
            className="input"
          />
        </div>
      </div>

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
}: {
  buffer: Buffer;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div>
        <label className="input-label">Capacity</label>
        <input
          type="number"
          value={buffer.capacity}
          onChange={(e) => onChange('capacity', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>

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
    </>
  );
}

// ── Source ──
function SourceProperties({
  node,
  onChange,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
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
        <div>
          <label className="input-label">Arrival Rate (seconds between arrivals)</label>
          <input
            type="number"
            value={node.arrivalRate || 120}
            onChange={(e) => onChange('arrivalRate', Number(e.target.value))}
            min={1}
            step={1}
            className="input"
          />
        </div>
      )}
      <div>
        <label className="input-label">Product Filter (optional)</label>
        <SourceProductFilter productFilter={node.productFilter} onChange={onChange} />
      </div>
      {!node.productFilter && (
        <div>
          <label className="input-label">Product Batch Size</label>
          <input
            type="number"
            value={node.productBatchSize || 1}
            onChange={(e) => onChange('productBatchSize', Math.max(1, Number(e.target.value)))}
            min={1}
            step={1}
            className="input"
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div>
        <label className="input-label">Length (meters)</label>
        <input
          type="number"
          value={node.length || 10}
          onChange={(e) => onChange('length', Number(e.target.value))}
          min={1}
          step={0.5}
          className="input"
        />
      </div>
      <div>
        <label className="input-label">Speed (m/s)</label>
        <input
          type="number"
          value={node.speed || 1}
          onChange={(e) => onChange('speed', Number(e.target.value))}
          min={0.1}
          step={0.1}
          className="input"
        />
      </div>
      <div>
        <label className="input-label">Capacity (items)</label>
        <input
          type="number"
          value={node.capacity || 10}
          onChange={(e) => onChange('capacity', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>
    </>
  );
}

// ── Operator ──
function OperatorProperties({
  node,
  onChange,
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div>
        <label className="input-label">Number of Operators</label>
        <input
          type="number"
          value={node.count || 1}
          onChange={(e) => onChange('count', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>
      <div>
        <label className="input-label">Efficiency (%)</label>
        <input
          type="number"
          value={node.efficiency || 100}
          onChange={(e) => onChange('efficiency', Number(e.target.value))}
          min={1}
          max={100}
          className="input"
        />
      </div>
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div>
        <label className="input-label">Inspection Time (seconds)</label>
        <input
          type="number"
          value={node.inspectionTime || 30}
          onChange={(e) => onChange('inspectionTime', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>
      <div>
        <label className="input-label">Defect Rate (%)</label>
        <input
          type="number"
          value={node.defectRate || 2}
          onChange={(e) => onChange('defectRate', Number(e.target.value))}
          min={0}
          max={100}
          step={0.1}
          className="input"
        />
      </div>
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const hasPerProduct = node.inputPartsByProduct && node.inputPartsByProduct.length > 0;
  const [perProductMode, setPerProductMode] = useState(hasPerProduct);
  const inputPartsByProduct: { productId: string; productName: string; quantity: number }[] = node.inputPartsByProduct || [];

  return (
    <>
      <div>
        <label className="input-label">Cycle Time (seconds)</label>
        <input
          type="number"
          value={node.cycleTime || 60}
          onChange={(e) => onChange('cycleTime', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const isProductBased = node.splitType === 'product-based';
  const productRouting: Record<string, number> = node.productRouting || {};

  return (
    <>
      <div>
        <label className="input-label">Number of Outputs</label>
        <input
          type="number"
          value={node.outputs || 2}
          onChange={(e) => onChange('outputs', Number(e.target.value))}
          min={2}
          max={5}
          className="input"
        />
      </div>
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      <div>
        <label className="input-label">Number of Inputs</label>
        <input
          type="number"
          value={node.inputs || 2}
          onChange={(e) => onChange('inputs', Number(e.target.value))}
          min={2}
          max={5}
          className="input"
        />
      </div>
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const outputParts: { productId: string; productName: string; quantity: number }[] = node.outputParts || [];

  return (
    <>
      <div>
        <label className="input-label">Cycle Time (seconds)</label>
        <input
          type="number"
          value={node.cycleTime || 30}
          onChange={(e) => onChange('cycleTime', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const palletSizeByProduct: Record<string, number> = node.palletSizeByProduct || {};

  return (
    <>
      <div>
        <label className="input-label">Default Pallet Size (items per pallet)</label>
        <input
          type="number"
          value={node.defaultPalletSize || 10}
          onChange={(e) => onChange('defaultPalletSize', Number(e.target.value))}
          min={1}
          className="input"
        />
        <p className="text-xs text-gray-400 mt-1">Used when no per-product size is set</p>
      </div>
      <div>
        <label className="input-label">Cycle Time (seconds)</label>
        <input
          type="number"
          value={node.cycleTime || 15}
          onChange={(e) => onChange('cycleTime', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
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
        <label className="input-label">Cycle Time per Item (seconds)</label>
        <input
          type="number"
          value={node.cycleTime || 5}
          onChange={(e) => onChange('cycleTime', Number(e.target.value))}
          min={0.1}
          step={0.1}
          className="input"
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
}: {
  node: any;
  onChange: (key: string, value: unknown) => void;
}) {
  const { model } = useModelStore();
  const products = model?.products || [];
  const requiredParts: { productId: string; productName: string; quantity: number }[] = node.requiredParts || [];

  return (
    <>
      <div>
        <label className="input-label">Capacity</label>
        <input
          type="number"
          value={node.capacity || 20}
          onChange={(e) => onChange('capacity', Number(e.target.value))}
          min={1}
          className="input"
        />
      </div>
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
      <div>
        <label className="input-label">Timeout (seconds, optional)</label>
        <input
          type="number"
          value={node.timeout || ''}
          onChange={(e) => onChange('timeout', e.target.value ? Number(e.target.value) : undefined)}
          placeholder="No timeout"
          min={0}
          className="input"
        />
      </div>
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
