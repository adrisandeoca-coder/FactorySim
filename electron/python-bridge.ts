import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { EventEmitter } from 'events';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class PythonBridge extends EventEmitter {
  private pythonPath: string;
  private process: ChildProcess | null = null;
  private readline: readline.Interface | null = null;
  private requestId = 0;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private isReady = false;
  private startupPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private restartCount = 0;
  private readonly REQUEST_TIMEOUT = 300000; // 5 minutes for long simulations
  private readonly MAX_RESTARTS = 3;

  constructor(pythonPath: string) {
    super();
    this.pythonPath = pythonPath;
  }

  async start(): Promise<void> {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = new Promise((resolve, reject) => {
      const serverScript = path.join(this.pythonPath, 'factorysim', 'api', 'server.py');

      // Try to find Python executable — prefer venv if it exists
      let pythonExecutable: string;
      const venvPythonWin = path.join(this.pythonPath, 'venv', 'Scripts', 'python.exe');
      const venvPythonUnix = path.join(this.pythonPath, 'venv', 'bin', 'python');

      if (process.platform === 'win32' && fs.existsSync(venvPythonWin)) {
        pythonExecutable = venvPythonWin;
      } else if (process.platform !== 'win32' && fs.existsSync(venvPythonUnix)) {
        pythonExecutable = venvPythonUnix;
      } else {
        pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
      }

      console.log('Using Python executable:', pythonExecutable);

      this.process = spawn(pythonExecutable, [serverScript], {
        cwd: this.pythonPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONPATH: this.pythonPath,
          PYTHONUNBUFFERED: '1',
        },
      });

      this.process.on('error', (error) => {
        console.error('Python process error:', error);
        this.emit('error', error);
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`Python process exited with code ${code}, signal ${signal}`);
        this.isReady = false;
        this.startupPromise = null;
        this.emit('exit', { code, signal });

        // Auto-restart on unexpected exit
        if (!this.shuttingDown && this.restartCount < this.MAX_RESTARTS) {
          console.log(`Unexpected Python exit — restarting (attempt ${this.restartCount + 1}/${this.MAX_RESTARTS})...`);
          setTimeout(() => {
            this.restart().catch((err) => {
              console.error('Python auto-restart failed:', err);
              this.emit('error', err);
            });
          }, 1000);
        } else if (!this.shuttingDown) {
          console.error(`Python process crashed ${this.MAX_RESTARTS} times — giving up`);
          this.emit('error', new Error(`Python process crashed ${this.MAX_RESTARTS} consecutive times`));
        }
      });

      // Handle stderr for logging
      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          console.error('Python stderr:', message);
          this.emit('log', { level: 'error', message });
        }
      });

      // Set up readline for JSON-RPC responses
      if (this.process.stdout) {
        this.readline = readline.createInterface({
          input: this.process.stdout,
          crlfDelay: Infinity,
        });

        this.readline.on('line', (line: string) => {
          this.handleResponse(line);
        });
      }

      // Wait for ready signal from Python
      const readyTimeout = setTimeout(() => {
        reject(new Error('Python bridge startup timeout'));
      }, 30000);

      const checkReady = (line: string) => {
        try {
          const data = JSON.parse(line);
          if (data.type === 'ready') {
            clearTimeout(readyTimeout);
            this.isReady = true;
            this.restartCount = 0;
            this.emit('ready');
            resolve();
          }
        } catch {
          // Not a ready message, ignore
        }
      };

      this.readline?.on('line', checkReady);
    });

    return this.startupPromise;
  }

  private handleResponse(line: string): void {
    try {
      const response: JsonRpcResponse = JSON.parse(line);

      // Handle progress updates (notifications)
      if ('method' in response && (response as unknown as { method: string }).method === 'progress') {
        this.emit('progress', (response as unknown as { params: unknown }).params);
        return;
      }

      // Handle streamed simulation events
      if ('method' in response && (response as unknown as { method: string }).method === 'simulation_event') {
        this.emit('simulation_event', (response as unknown as { params: unknown }).params);
        return;
      }

      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (error) {
      console.error('Failed to parse Python response:', line, error);
    }
  }

  private async restart(): Promise<void> {
    this.restartCount++;
    this.startupPromise = null;
    this.isReady = false;
    this.process = null;
    this.readline = null;
    await this.start();
    this.emit('restarted');
  }

  private async ensureReady(): Promise<void> {
    if (this.isReady) return;
    if (this.shuttingDown) throw new Error('Bridge is shutting down');
    if (this.startupPromise) {
      await this.startupPromise;
    } else {
      await this.start();
    }
  }

  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for method: ${method}`));
      }, this.REQUEST_TIMEOUT);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      const requestStr = JSON.stringify(request) + '\n';
      this.process?.stdin?.write(requestStr);
    });
  }

  // Simulation methods
  async runSimulation(model: object, options: object): Promise<unknown> {
    return this.call('run_simulation', { model, options });
  }

  async validateModel(model: object): Promise<unknown> {
    return this.call('validate_model', { model });
  }

  async stopSimulation(runId: string): Promise<void> {
    await this.call('stop_simulation', { run_id: runId });
  }

  async getSimulationStatus(runId: string): Promise<unknown> {
    return this.call('get_simulation_status', { run_id: runId });
  }

  // Code generation
  async exportToPython(model: object, options?: object): Promise<string> {
    return this.call<string>('export_to_python', { model, options: options || {} });
  }

  // Data import
  async importCSV(filePath: string, options: object): Promise<unknown> {
    return this.call('import_csv', { file_path: filePath, options });
  }

  async importExcel(filePath: string, options: object): Promise<unknown> {
    return this.call('import_excel', { file_path: filePath, options });
  }

  // KPI calculations
  async calculateKPIs(runId: string): Promise<unknown> {
    return this.call('calculate_kpis', { run_id: runId });
  }

  async detectBottlenecks(runId: string): Promise<unknown> {
    return this.call('detect_bottlenecks', { run_id: runId });
  }

  // Model validation / trace / event log
  async getEntityTraces(runId: string, limit: number = 100): Promise<unknown> {
    return this.call('get_entity_traces', { run_id: runId, limit });
  }

  async getEventLog(runId: string, options?: {
    eventTypes?: string[];
    entityId?: string;
    timeRange?: [number, number];
    limit?: number;
  }): Promise<unknown> {
    return this.call('get_event_log', {
      run_id: runId,
      event_types: options?.eventTypes,
      entity_id: options?.entityId,
      time_range: options?.timeRange,
      limit: options?.limit || 500,
    });
  }

  // REPL for advanced users
  async executeCode(code: string): Promise<unknown> {
    return this.call('execute_code', { code });
  }

  shutdown(): void {
    this.shuttingDown = true;

    // Cancel all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge shutdown'));
      this.pendingRequests.delete(id);
    }

    // Close readline
    this.readline?.close();
    this.readline = null;

    // Kill Python process
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.isReady = false;
    this.startupPromise = null;
  }

  isRunning(): boolean {
    return this.isReady && this.process !== null;
  }
}
