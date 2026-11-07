import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { useModelStore } from '../../stores/modelStore';
import { useAppStore } from '../../stores/appStore';
import type { FactoryModel, ScriptResult } from '../../types';
import {
  SCRIPT_EXAMPLES, buildModelScript, normalizeScriptModel, scriptBackendAvailable, scriptFromModel,
} from '../../services/modelScript';
import { ScriptPreview } from './ScriptPreview';
import { t, useT } from '../../i18n';

const DRAFT_KEY = 'factorysim-model-script';
const DEBOUNCE_MS = 700;

function loadDraft(): string | null {
  try { return localStorage.getItem(DRAFT_KEY); } catch { return null; }
}
function saveDraft(code: string) {
  try { localStorage.setItem(DRAFT_KEY, code); } catch { /* storage unavailable */ }
}

const ELEMENT_METHODS: [string, string, string][] = [
  ['station', 'station("${1:Name}", cycle=${2:60})', 'Station: cycle=seconds or a distribution, mtbf/mttr in hours, scrap, setup, batch'],
  ['buffer', 'buffer("${1:Name}", capacity=${2:10})', 'Buffer: capacity, rule="FIFO" | "LIFO" | "PRIORITY"'],
  ['source', 'source("${1:Source}", every=${2:60})', 'Source: one arrival every N seconds'],
  ['sink', 'sink("${1:Sink}")', 'Sink: parts leave the model here'],
  ['conveyor', 'conveyor("${1:Conveyor}", length=${2:10}, speed=${3:1})', 'Conveyor: length m, speed m/s, capacity'],
  ['operator', 'operator("${1:Operators}", count=${2:1})', 'Operator pool; assign with op.serves(st1, st2)'],
  ['inspection', 'inspection("${1:Inspection}", inspection_time=${2:30}, defect_rate=${3:2})', 'Inspection: seconds, defect rate in %'],
  ['assembly', 'assembly("${1:Assembly}", cycle_time=${2:60}, input_parts=${3:2})', 'Assembly of N input parts'],
  ['splitter', 'splitter("${1:Splitter}", outputs=${2:2})', 'Splitter: splits flow over its outputs'],
  ['merge', 'merge("${1:Merge}", inputs=${2:2})', 'Merge: joins flows'],
  ['product', 'product("${1:Product}", route=[${2}])', 'Product type with its own station route'],
  ['line', 'line(${1})', 'Connect elements in order'],
  ['add', 'add("${1:press}", "${2:Name}")', 'Any element type by name, e.g. "press", "weldingcell", "warehouse"'],
];
const DIST_FUNCS: [string, string, string][] = [
  ['normal', 'normal(${1:mean}, ${2:std})', 'Normal distribution (seconds)'],
  ['tri', 'tri(${1:low}, ${2:mode}, ${3:high})', 'Triangular distribution'],
  ['expo', 'expo(${1:mean})', 'Exponential distribution'],
  ['uniform', 'uniform(${1:low}, ${2:high})', 'Uniform distribution'],
  ['lognormal', 'lognormal(${1:mean}, ${2:sigma})', 'Lognormal distribution'],
  ['weibull', 'weibull(${1:shape}, ${2:scale})', 'Weibull distribution'],
  ['empirical', 'empirical([${1}])', 'Pick from measured values'],
  ['Model', 'Model("${1:My line}")', 'Start a model: m = Model("Line 1")'],
];

let completionsRegistered = false;
function registerCompletions(monaco: typeof Monaco) {
  if (completionsRegistered) return;
  completionsRegistered = true;
  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn };
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
      if (/\b(m|model)\.$/.test(before)) {
        return { suggestions: ELEMENT_METHODS.map(([label, insertText, doc]) => ({
          label, insertText, documentation: doc, range, insertTextRules: snippet,
          kind: monaco.languages.CompletionItemKind.Method })) };
      }
      if (before.endsWith('.')) {
        return { suggestions: [
          ['to', 'to(${1:target}, transport="${2|conveyor,manual,forklift,agv,direct|}")', 'Connect with a transport mode or probability'],
          ['serves', 'serves(${1})', 'Operator serves these stations'],
          ['set', 'set(${1})', 'Change fields after creation'],
        ].map(([label, insertText, doc]) => ({ label, insertText, documentation: doc, range,
          insertTextRules: snippet, kind: monaco.languages.CompletionItemKind.Method })) };
      }
      return { suggestions: DIST_FUNCS.map(([label, insertText, doc]) => ({
        label, insertText, documentation: doc, range, insertTextRules: snippet,
        kind: monaco.languages.CompletionItemKind.Function })) };
    },
  });
}

type Status = 'idle' | 'building' | 'ok' | 'error' | 'offline';

export function ModelScriptEditor() {
  useT();
  const navigate = useNavigate();
  const model = useModelStore(s => s.model);
  const setModel = useModelStore(s => s.setModel);
  const addToast = useAppStore(s => s.addToast);

  const [code, setCode] = useState(() => loadDraft() ?? SCRIPT_EXAMPLES[0].code);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [preview, setPreview] = useState<FactoryModel | null>(null);
  const [status, setStatus] = useState<Status>(scriptBackendAvailable() ? 'idle' : 'offline');
  const [tab, setTab] = useState<'problems' | 'output' | 'api'>('problems');
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const seq = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const buildRef = useRef<(src: string) => void>(() => {});

  const build = useCallback(async (src: string) => {
    if (!scriptBackendAvailable()) { setStatus('offline'); return; }
    const id = ++seq.current;
    setStatus('building');
    const r = await buildModelScript(src);
    if (id !== seq.current) return; // a newer build started
    setResult(r);
    if (r.ok && r.model) {
      try {
        setPreview(normalizeScriptModel(r.model));
        setStatus('ok');
        setLoaded(false);
      } catch (e) {
        setResult({ ...r, ok: false, error: e instanceof Error ? e.message : String(e) });
        setStatus('error');
      }
    } else {
      setStatus('error');
      setTab('problems');
    }
  }, []);
  useEffect(() => { buildRef.current = build; }, [build]);

  // live preview: rebuild shortly after typing stops
  useEffect(() => {
    saveDraft(code);
    const h = setTimeout(() => build(code), DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [code, build]);

  // error marker in the editor
  useEffect(() => {
    const monaco = monacoRef.current, ed = editorRef.current;
    const m = ed?.getModel();
    if (!monaco || !m) return;
    if (result && !result.ok && result.error) {
      const line = Math.min(Math.max(result.line || 1, 1), m.getLineCount());
      monaco.editor.setModelMarkers(m, 'factorysim', [{
        severity: monaco.MarkerSeverity.Error, message: result.error,
        startLineNumber: line, endLineNumber: line, startColumn: 1, endColumn: m.getLineMaxColumn(line),
      }]);
    } else {
      monaco.editor.setModelMarkers(m, 'factorysim', []);
    }
  }, [result]);

  const onMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco as unknown as typeof Monaco;
    registerCompletions(monaco as unknown as typeof Monaco);
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => buildRef.current(ed.getValue()));
  };

  /** Replace the editor text as one undoable edit (Ctrl+Z brings the old text back). */
  const replaceCode = (next: string) => {
    const ed = editorRef.current;
    const m = ed?.getModel();
    if (ed && m) {
      ed.pushUndoStop();
      ed.executeEdits('factorysim', [{ range: m.getFullModelRange(), text: next }]);
      ed.pushUndoStop();
      ed.setScrollTop(0);
    } else {
      setCode(next);
    }
  };

  const revealName = (name: string) => {
    const ed = editorRef.current;
    const m = ed?.getModel();
    if (!ed || !m) return;
    const hit = m.findMatches(`"${name}"`, false, false, true, null, false)[0]
      ?? m.findMatches(`'${name}'`, false, false, true, null, false)[0];
    if (hit) {
      ed.revealLineInCenter(hit.range.startLineNumber);
      ed.setSelection(hit.range);
      ed.focus();
    }
  };

  const fromCanvas = async () => {
    const src = await scriptFromModel(model);
    if (src == null) { addToast({ type: 'error', message: t('Model scripts need the engine of the desktop app.') }); return; }
    replaceCode(src);
    addToast({ type: 'info', message: t('Script written from the current model. Ctrl+Z restores your previous script.') });
  };

  const canvasHasContent = model.stations.length > 0 || model.buffers.length > 0 || model.extraNodes.length > 2;

  const loadIntoModel = () => {
    if (!preview) return;
    if (canvasHasContent && !confirmLoad) { setConfirmLoad(true); return; }
    setConfirmLoad(false);
    setModel(structuredClone(preview));
    setLoaded(true);
    addToast({ type: 'success', message: t('Model loaded. Undo (Ctrl+Z) in the builder restores the previous model.') });
  };

  const saveFile = () => {
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const base = (preview?.name || 'model').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'model';
    a.href = url; a.download = `${base}.py`; a.click();
    URL.revokeObjectURL(url);
  };

  const openFile = (f: File | undefined) => {
    if (!f) return;
    f.text().then(replaceCode).catch(() => addToast({ type: 'error', message: t('Could not read the file') }));
  };

  const counts = useMemo(() => {
    if (!preview) return null;
    return {
      stations: preview.stations.length,
      buffers: preview.buffers.length,
      other: preview.extraNodes.length,
      links: preview.connections.length,
      products: preview.products.length,
    };
  }, [preview]);

  const statusChip = {
    idle: { text: t('Waiting'), color: '#64748B' },
    building: { text: t('Building…'), color: '#64748B' },
    ok: { text: t('Built'), color: 'var(--data-green, #16A34A)' },
    error: { text: result?.line ? t('Error on line {n}', { n: result.line }) : t('Error'), color: 'var(--red, #DC2626)' },
    offline: { text: t('Engine not available'), color: 'var(--data-amber, #D97706)' },
  }[status];

  return (
    <div className="h-full flex flex-col min-h-0 gap-2">
      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Button variant="secondary" size="sm" onClick={() => setExamplesOpen(o => !o)}>{t('Examples')} ▾</Button>
          {examplesOpen && (
            <div className="absolute left-0 mt-1 w-64 bg-white border border-[var(--chrome-border)] shadow-sm z-20 py-1 rounded-sm">
              {SCRIPT_EXAMPLES.map(ex => (
                <button key={ex.id} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[var(--select-bg)]"
                  onClick={() => { replaceCode(ex.code); setExamplesOpen(false); }}>
                  {t(ex.name)}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={fromCanvas} title={t('Write the model on the canvas as a script')}>
          {t('From current model')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>{t('Open .py')}</Button>
        <Button variant="secondary" size="sm" onClick={saveFile}>{t('Save .py')}</Button>
        <input ref={fileInput} type="file" accept=".py,text/x-python,text/plain" className="hidden"
          onChange={e => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
        <Button variant="secondary" size="sm" onClick={() => build(editorRef.current?.getValue() ?? code)}
          title="Ctrl+Enter">
          {t('Rebuild')}
        </Button>

        <span className="inline-flex items-center gap-1.5 text-[12px] ml-1" style={{ color: statusChip.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: statusChip.color }} />
          {statusChip.text}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {confirmLoad ? (
            <>
              <span className="text-[12px] text-[var(--text-secondary)]">{t('Replace the model on the canvas?')}</span>
              <Button size="sm" onClick={loadIntoModel}>{t('Replace')}</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmLoad(false)}>{t('Cancel')}</Button>
            </>
          ) : loaded ? (
            <>
              <span className="text-[12px] text-[var(--data-green,#16A34A)]">{t('Loaded')}</span>
              <Button variant="secondary" size="sm" onClick={() => navigate('/builder')}>{t('Open in builder')}</Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/world')}>{t('Open in 3D')}</Button>
            </>
          ) : (
            <Button size="sm" onClick={loadIntoModel} disabled={!preview || status !== 'ok'}>
              {t('Load into model')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] gap-2 min-h-0">
        {/* editor */}
        <div className="dock-panel min-h-[320px]">
          <div className="panel-titlebar">
            <span>{t('Model script')} <span className="panel-subtitle">Python · Ctrl+Enter {t('to rebuild')}</span></span>
          </div>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language="python"
              value={code}
              onChange={v => setCode(v ?? '')}
              onMount={onMount}
              theme="vs-light"
              options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'IBM Plex Mono, Consolas, monospace',
                scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, renderWhitespace: 'none' }}
            />
          </div>
        </div>

        {/* preview + console */}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="dock-panel flex-1 min-h-[260px]">
            <div className="panel-titlebar">
              <span>{t('Preview')} {preview && <span className="panel-subtitle">{preview.name}</span>}</span>
              {counts && (
                <span className="panel-subtitle text-[11px]">
                  {t('{n} stations', { n: counts.stations })} · {t('{n} buffers', { n: counts.buffers })} · {t('{n} other', { n: counts.other })} · {t('{n} links', { n: counts.links })} · {t('{n} products', { n: counts.products })}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 relative bg-white">
              {preview ? (
                <ScriptPreview model={preview} onPick={revealName} dimmed={status === 'error'} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[var(--text-tertiary)] px-6 text-center">
                  {status === 'offline'
                    ? t('Model scripts need the engine of the desktop app.')
                    : status === 'error' ? t('Fix the error to see the model.') : t('Building…')}
                </div>
              )}
              {preview && status === 'error' && (
                <div className="absolute left-2 bottom-2 text-[11px] bg-white/90 border border-[var(--chrome-border)] px-2 py-1 rounded-sm text-[var(--text-secondary)]">
                  {t('Showing the last model that built')}
                </div>
              )}
            </div>
          </div>

          <div className="dock-panel h-[200px] flex-shrink-0">
            <div className="panel-titlebar">
              <span className="flex gap-3">
                {(['problems', 'output', 'api'] as const).map(k => (
                  <button key={k} onClick={() => setTab(k)}
                    className={tab === k ? 'text-[#1E293B]' : 'text-[#64748B] font-normal'}>
                    {k === 'problems' ? `${t('Problems')}${result && !result.ok ? ' (1)' : ''}`
                      : k === 'output' ? t('Output') : t('API reference')}
                  </button>
                ))}
              </span>
            </div>
            <div className="dock-panel-body p-2 text-[12px]">
              {tab === 'problems' && (
                result && !result.ok ? (
                  <button className="text-left w-full font-mono text-[12px] text-[var(--red,#DC2626)] hover:bg-[var(--red-bg)] px-1"
                    onClick={() => { if (result.line) { editorRef.current?.revealLineInCenter(result.line); editorRef.current?.setPosition({ lineNumber: result.line, column: 1 }); editorRef.current?.focus(); } }}>
                    {result.line ? `${t('Line')} ${result.line}: ` : ''}{result.error}
                    {result.traceback && <pre className="mt-1 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap">{result.traceback}</pre>}
                  </button>
                ) : (
                  <span className="text-[var(--text-tertiary)]">{status === 'offline' ? t('Model scripts need the engine of the desktop app.') : t('No problems')}</span>
                )
              )}
              {tab === 'output' && (
                <pre className="font-mono text-[12px] whitespace-pre-wrap text-[#1E293B]">{result?.output || t('Nothing printed. Use print() in the script to write here.')}</pre>
              )}
              {tab === 'api' && <ApiReference />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiReference() {
  const rows: [string, string][] = [
    ['m = Model("Line 1")', t('Start a model')],
    ['m.station(name, cycle=60, mtbf=8, mttr=0.5, scrap=0.02, setup=120, batch=1)', t('Station. Times in seconds, MTBF/MTTR in hours')],
    ['m.buffer(name, capacity=10, rule="FIFO")', t('Buffer')],
    ['m.source(name, every=60)  /  m.sink(name)', t('Where parts enter and leave')],
    ['m.conveyor, m.inspection, m.assembly, m.splitter, m.merge, m.operator …', t('Other elements; m.add("press", name, …) takes any type')],
    ['normal(40, 4)  tri(30, 35, 45)  expo(60)  uniform(a, b)  empirical([…])', t('Distributions for cycle and setup times')],
    ['a >> b >> c      a >> [b, c]      [b, c] >> d', t('Connect elements')],
    ['a.to(b, transport="forklift", probability=0.3)', t('Transport: auto, conveyor, manual, forklift, agv, direct')],
    ['op.serves(st1, st2)', t('Operators work at these stations')],
    ['m.product("Shaft", route=[saw, lathe, qc])', t('Product with its own route. Without products, every path gets one.')],
    ['st.set(mtbf=12)    at=(x, y)', t('Change fields later; place an element (otherwise laid out automatically)')],
  ];
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([c, d]) => (
          <tr key={c} className="align-top border-b border-[var(--border-subtle)]">
            <td className="font-mono text-[11.5px] pr-3 py-1 text-[#1E293B] whitespace-nowrap">{c}</td>
            <td className="py-1 text-[var(--text-secondary)]">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
