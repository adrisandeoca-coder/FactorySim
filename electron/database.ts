import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';

export class DatabaseManager {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // In packaged builds the WASM binary is extracted outside ASAR via asarUnpack.
    // Point locateFile at the unpacked path so sql.js can load it.
    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        const { app } = require('electron');
        if (!app.isPackaged) {
          return path.join(__dirname, '../../node_modules/sql.js/dist', file);
        }
        // __dirname = resources/app.asar/dist/electron
        // WASM is at resources/app.asar.unpacked/node_modules/sql.js/dist/
        const asarRoot = path.join(__dirname, '../..');  // resources/app.asar
        const unpackedRoot = asarRoot.replace('app.asar', 'app.asar.unpacked');
        return path.join(unpackedRoot, 'node_modules', 'sql.js', 'dist', file);
      },
    });

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    await this.createTables();
    this.save();
  }

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Factory Models table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS factory_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        model_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Scenarios table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        model_id TEXT NOT NULL,
        name TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES factory_models(id) ON DELETE CASCADE
      )
    `);

    // Simulation Runs table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS simulation_runs (
        id TEXT PRIMARY KEY,
        scenario_id TEXT,
        model_id TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        status TEXT NOT NULL DEFAULT 'pending',
        options_json TEXT,
        results_path TEXT,
        kpis_json TEXT,
        FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL,
        FOREIGN KEY (model_id) REFERENCES factory_models(id) ON DELETE CASCADE
      )
    `);

    // Sync Configurations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sync_configs (
        id TEXT PRIMARY KEY,
        connector_type TEXT NOT NULL,
        name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_sync DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table (for RBAC)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        role TEXT NOT NULL DEFAULT 'operator',
        preferences_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);

    // Imported Data table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS imported_data (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        data_type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        quality_score REAL,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Templates table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        template_json TEXT NOT NULL,
        is_builtin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default templates if they don't exist
    await this.insertDefaultTemplates();
  }

  private async insertDefaultTemplates(): Promise<void> {
    if (!this.db) return;

    const result = this.db.exec('SELECT COUNT(*) as count FROM templates WHERE is_builtin = 1');
    const count = result.length > 0 && result[0].values.length > 0 ? (result[0].values[0][0] as number) : 0;

    if (count === 0) {
      const templates = [
        {
          id: 'template-flow-line',
          name: 'Flow Line',
          description: 'Linear production line with sequential stations',
          category: 'manufacturing',
          template: {
            stations: [
              { id: 's1', name: 'Station 1', cycleTime: { type: 'normal', parameters: { mean: 60, std: 5 } }, position: { x: 100, y: 200 } },
              { id: 's2', name: 'Station 2', cycleTime: { type: 'normal', parameters: { mean: 55, std: 8 } }, position: { x: 300, y: 200 } },
              { id: 's3', name: 'Station 3', cycleTime: { type: 'normal', parameters: { mean: 65, std: 6 } }, position: { x: 500, y: 200 } },
            ],
            buffers: [
              { id: 'b1', name: 'Buffer 1-2', capacity: 10, queueRule: 'FIFO', position: { x: 200, y: 200 } },
              { id: 'b2', name: 'Buffer 2-3', capacity: 10, queueRule: 'FIFO', position: { x: 400, y: 200 } },
            ],
            connections: [
              { id: 'c1', source: 's1', target: 'b1' },
              { id: 'c2', source: 'b1', target: 's2' },
              { id: 'c3', source: 's2', target: 'b2' },
              { id: 'c4', source: 'b2', target: 's3' },
            ],
          },
        },
        {
          id: 'template-job-shop',
          name: 'Job Shop',
          description: 'Flexible routing with multiple parallel stations',
          category: 'manufacturing',
          template: {
            stations: [
              { id: 's1', name: 'Milling 1', cycleTime: { type: 'triangular', parameters: { min: 30, mode: 45, max: 60 } }, position: { x: 200, y: 100 } },
              { id: 's2', name: 'Milling 2', cycleTime: { type: 'triangular', parameters: { min: 30, mode: 45, max: 60 } }, position: { x: 200, y: 300 } },
              { id: 's3', name: 'Turning 1', cycleTime: { type: 'exponential', parameters: { mean: 40 } }, position: { x: 400, y: 100 } },
              { id: 's4', name: 'Turning 2', cycleTime: { type: 'exponential', parameters: { mean: 40 } }, position: { x: 400, y: 300 } },
              { id: 's5', name: 'Assembly', cycleTime: { type: 'normal', parameters: { mean: 50, std: 10 } }, position: { x: 600, y: 200 } },
            ],
            buffers: [
              { id: 'b1', name: 'Input Queue', capacity: 50, queueRule: 'FIFO', position: { x: 50, y: 200 } },
              { id: 'b2', name: 'WIP Buffer', capacity: 30, queueRule: 'FIFO', position: { x: 300, y: 200 } },
              { id: 'b3', name: 'Assembly Queue', capacity: 20, queueRule: 'FIFO', position: { x: 500, y: 200 } },
            ],
            connections: [],
          },
        },
        {
          id: 'template-batch-process',
          name: 'Batch Processing',
          description: 'Batch-based production with setup times',
          category: 'process',
          template: {
            stations: [
              { id: 's1', name: 'Mixing', cycleTime: { type: 'constant', parameters: { value: 120 } }, batchSize: 100, setupTime: { type: 'constant', parameters: { value: 30 } }, position: { x: 150, y: 200 } },
              { id: 's2', name: 'Heating', cycleTime: { type: 'constant', parameters: { value: 180 } }, batchSize: 100, position: { x: 350, y: 200 } },
              { id: 's3', name: 'Cooling', cycleTime: { type: 'constant', parameters: { value: 90 } }, batchSize: 100, position: { x: 550, y: 200 } },
              { id: 's4', name: 'Packaging', cycleTime: { type: 'normal', parameters: { mean: 5, std: 1 } }, position: { x: 750, y: 200 } },
            ],
            buffers: [
              { id: 'b1', name: 'Raw Materials', capacity: 500, queueRule: 'FIFO', position: { x: 50, y: 200 } },
              { id: 'b2', name: 'Heated Buffer', capacity: 200, queueRule: 'FIFO', position: { x: 450, y: 200 } },
              { id: 'b3', name: 'Finished Goods', capacity: 1000, queueRule: 'FIFO', position: { x: 850, y: 200 } },
            ],
            connections: [],
          },
        },
        {
          id: 'template-assembly-cell',
          name: 'Assembly Cell',
          description: 'Multi-product assembly with shared resources',
          category: 'assembly',
          template: {
            stations: [
              { id: 's1', name: 'Sub-Assembly A', cycleTime: { type: 'normal', parameters: { mean: 30, std: 5 } }, position: { x: 150, y: 100 } },
              { id: 's2', name: 'Sub-Assembly B', cycleTime: { type: 'normal', parameters: { mean: 35, std: 5 } }, position: { x: 150, y: 300 } },
              { id: 's3', name: 'Final Assembly', cycleTime: { type: 'normal', parameters: { mean: 45, std: 8 } }, position: { x: 350, y: 200 } },
              { id: 's4', name: 'Testing', cycleTime: { type: 'exponential', parameters: { mean: 20 } }, scrapRate: 0.02, position: { x: 550, y: 200 } },
            ],
            buffers: [
              { id: 'b1', name: 'Parts A', capacity: 50, queueRule: 'FIFO', position: { x: 50, y: 100 } },
              { id: 'b2', name: 'Parts B', capacity: 50, queueRule: 'FIFO', position: { x: 50, y: 300 } },
              { id: 'b3', name: 'Assembly Buffer', capacity: 20, queueRule: 'FIFO', position: { x: 250, y: 200 } },
            ],
            connections: [],
          },
        },
        {
          id: 'template-u-cell',
          name: 'U-Cell',
          description: 'U-shaped cell for flexible operator allocation',
          category: 'lean',
          template: {
            stations: [
              { id: 's1', name: 'Op 10', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 100, y: 100 } },
              { id: 's2', name: 'Op 20', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 250, y: 100 } },
              { id: 's3', name: 'Op 30', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 400, y: 100 } },
              { id: 's4', name: 'Op 40', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 400, y: 300 } },
              { id: 's5', name: 'Op 50', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 250, y: 300 } },
              { id: 's6', name: 'Op 60', cycleTime: { type: 'constant', parameters: { value: 25 } }, position: { x: 100, y: 300 } },
            ],
            buffers: [],
            connections: [
              { id: 'c1', source: 's1', target: 's2' },
              { id: 'c2', source: 's2', target: 's3' },
              { id: 'c3', source: 's3', target: 's4' },
              { id: 'c4', source: 's4', target: 's5' },
              { id: 'c5', source: 's5', target: 's6' },
            ],
          },
        },
      ];

      for (const template of templates) {
        this.db.run(
          `INSERT INTO templates (id, name, description, category, template_json, is_builtin)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [template.id, template.name, template.description, template.category, JSON.stringify(template.template)]
        );
      }
    }
  }

  // Helper to run a query and get results as objects
  private queryAll<T>(sql: string, params: (string | number | null)[] = []): T[] {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const results: T[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row as T);
    }
    stmt.free();
    return results;
  }

  private queryOne<T>(sql: string, params: (string | number | null)[] = []): T | undefined {
    const results = this.queryAll<T>(sql, params);
    return results[0];
  }

  // Model operations
  saveModel(id: string, name: string, description: string | null, modelJson: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const existing = this.queryOne('SELECT id FROM factory_models WHERE id = ?', [id]);

    if (existing) {
      this.db.run(
        `UPDATE factory_models
         SET name = ?, description = ?, model_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name, description, modelJson, id]
      );
    } else {
      this.db.run(
        `INSERT INTO factory_models (id, name, description, model_json)
         VALUES (?, ?, ?, ?)`,
        [id, name, description, modelJson]
      );
    }
    this.save();
  }

  loadModel(id: string): { id: string; name: string; description: string | null; model_json: string; created_at: string; updated_at: string } | undefined {
    return this.queryOne('SELECT * FROM factory_models WHERE id = ?', [id]);
  }

  listModels(): { id: string; name: string; description: string | null; created_at: string; updated_at: string }[] {
    return this.queryAll(`
      SELECT id, name, description, created_at, updated_at
      FROM factory_models
      ORDER BY updated_at DESC
    `);
  }

  deleteModel(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run('DELETE FROM factory_models WHERE id = ?', [id]);
    this.save();
  }

  // Scenario operations
  createScenario(id: string, modelId: string, name: string, parametersJson: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      `INSERT INTO scenarios (id, model_id, name, parameters_json)
       VALUES (?, ?, ?, ?)`,
      [id, modelId, name, parametersJson]
    );
    this.save();
  }

  loadScenario(id: string): { id: string; model_id: string; name: string; parameters_json: string; created_at: string } | undefined {
    return this.queryOne('SELECT * FROM scenarios WHERE id = ?', [id]);
  }

  listScenarios(modelId?: string): { id: string; model_id: string; name: string; created_at: string }[] {
    if (modelId) {
      return this.queryAll(`
        SELECT id, model_id, name, created_at
        FROM scenarios
        WHERE model_id = ?
        ORDER BY created_at DESC
      `, [modelId]);
    }

    return this.queryAll(`
      SELECT id, model_id, name, created_at
      FROM scenarios
      ORDER BY created_at DESC
    `);
  }

  deleteScenario(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run('DELETE FROM scenarios WHERE id = ?', [id]);
    this.save();
  }

  // Simulation run operations
  createSimulationRun(id: string, modelId: string, scenarioId: string | null, optionsJson: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      `INSERT INTO simulation_runs (id, model_id, scenario_id, options_json, status)
       VALUES (?, ?, ?, ?, 'running')`,
      [id, modelId, scenarioId, optionsJson]
    );
    this.save();
  }

  updateSimulationRun(id: string, status: string, resultsPath?: string, kpisJson?: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(
      `UPDATE simulation_runs
       SET status = ?, completed_at = CURRENT_TIMESTAMP, results_path = ?, kpis_json = ?
       WHERE id = ?`,
      [status, resultsPath || null, kpisJson || null, id]
    );
    this.save();
  }

  getSimulationRun(id: string): { id: string; scenario_id: string | null; model_id: string; status: string; kpis_json: string | null; options_json: string | null; started_at: string; completed_at: string | null } | undefined {
    return this.queryOne('SELECT * FROM simulation_runs WHERE id = ?', [id]);
  }

  getSimulationRunByScenario(scenarioId: string): { id: string; scenario_id: string; model_id: string; status: string; kpis_json: string | null; options_json: string | null; started_at: string; completed_at: string | null } | undefined {
    return this.queryOne(
      `SELECT * FROM simulation_runs WHERE scenario_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
      [scenarioId]
    );
  }

  // Template operations
  listTemplates(category?: string): { id: string; name: string; description: string; category: string }[] {
    if (category) {
      return this.queryAll(`
        SELECT id, name, description, category
        FROM templates
        WHERE category = ?
        ORDER BY name
      `, [category]);
    }

    return this.queryAll(`
      SELECT id, name, description, category
      FROM templates
      ORDER BY category, name
    `);
  }

  getTemplate(id: string): { id: string; name: string; description: string; category: string; template_json: string } | undefined {
    return this.queryOne('SELECT * FROM templates WHERE id = ?', [id]);
  }

  // User operations
  getUser(username: string): { id: string; username: string; display_name: string; role: string; preferences_json: string } | undefined {
    return this.queryOne('SELECT * FROM users WHERE username = ?', [username]);
  }

  createOrUpdateUser(id: string, username: string, displayName: string, role: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const existing = this.queryOne('SELECT id FROM users WHERE username = ?', [username]);

    if (existing) {
      this.db.run(
        `UPDATE users SET display_name = ?, role = ?, last_login = CURRENT_TIMESTAMP WHERE username = ?`,
        [displayName, role, username]
      );
    } else {
      this.db.run(
        `INSERT INTO users (id, username, display_name, role) VALUES (?, ?, ?, ?)`,
        [id, username, displayName, role]
      );
    }
    this.save();
  }

  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}
