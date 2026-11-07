import { useAppStore } from '../../stores/appStore';
import { useModelStore } from '../../stores/modelStore';
import { useSimulationStore } from '../../stores/simulationStore';
import { useLiveSimulationStore } from '../../stores/liveSimulationStore';
import { version as APP_VERSION } from '../../../package.json';
import { useT } from '../../i18n';

/** Bottom status bar (engineering-desktop style). */
export function StatusBar() {
  const { isSimulating, simulationProgress, simpleMode } = useAppStore();
  const { model } = useModelStore();
  const { scenarios } = useSimulationStore();
  const isReplaying = useLiveSimulationStore((s) => s.isReplaying);
  const t = useT();
  const engineConnected = typeof window !== 'undefined' && !!window.factorySim?.simulation?.runSimulation;

  const status = isSimulating
    ? t('Simulating… {p}%', { p: Math.round(simulationProgress * 100) })
    : isReplaying ? t('Replaying run') : t('Ready');

  const plural = (n: number, w: string) => t(n === 1 ? `{n} ${w}` : `{n} ${w}s`, { n });

  return (
    <footer className="status-bar" role="status">
      <span className="status-bar-item" style={{ fontWeight: 600 }}>{status}</span>
      <span className="status-bar-item">
        {plural(model.stations.length, 'station')} · {plural(model.buffers.length, 'buffer')} · {plural(model.products.length, 'product')} · {plural(scenarios.length, 'scenario')}
      </span>
      <span style={{ flex: 1 }} />
      <span className="status-bar-item" title={engineConnected ? t('Python simulation engine connected') : t('Simulation engine not connected')}>
        <span className="status-dot" style={{ background: engineConnected ? 'var(--data-green)' : 'var(--gray-400)', display: 'inline-block', marginRight: 6 }} />
        {engineConnected ? t('Engine ready (SimPy)') : t('Engine not connected')}
      </span>
      <span className="status-bar-item">{t('Time unit: seconds')}</span>
      <span className="status-bar-item">{simpleMode ? t('Simple mode') : t('Expert mode')}</span>
      <span className="status-bar-item">FactorySim {APP_VERSION}</span>
    </footer>
  );
}
