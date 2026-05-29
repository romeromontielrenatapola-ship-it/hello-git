import { Injectable } from '@angular/core';

export interface SqlQueryLog {
  id: string;
  sql: string;
  params: string;
  timestamp: Date;
  status: 'SUCCESS' | 'ERROR';
  rowsAffected: number;
  errorMessage?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SqliteLocalService {
  private readonly storagePrefix = 'sqlite_db_';
  public queryLogs: SqlQueryLog[] = [];

  constructor() {
    this.initDatabase();
  }

  // Initialize tables as defined in the syllabus
  private async initDatabase(): Promise<void> {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    const initQueries = [
      `CREATE TABLE IF NOT EXISTS local_cards (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        element TEXT,
        rarity TEXT,
        hp INTEGER,
        attack INTEGER,
        defense INTEGER,
        cost INTEGER,
        image_url TEXT,
        description TEXT,
        created_at TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS user_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS local_matches (
        id TEXT PRIMARY KEY,
        difficulty TEXT,
        opponent_name TEXT,
        result TEXT,
        lp_player INTEGER,
        lp_opponent INTEGER,
        date TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS local_history (
        id TEXT PRIMARY KEY,
        log_type TEXT,
        description TEXT,
        timestamp TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS temp_deck (
        deck_id TEXT,
        card_id TEXT,
        quantity INTEGER,
        PRIMARY KEY (deck_id, card_id)
      );`
    ];

    for (const sql of initQueries) {
      await this.query(sql);
    }
  }

  /**
   * Main query entrypoint.
   * Simulates standard SQLite query execution and maps to LocalStorage schemas.
   */
  public async query(sql: string, params: any[] = []): Promise<any[]> {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return [];
    }
    const timestamp = new Date();
    const cleanSql = sql.trim().replace(/\s+/g, ' ');
    const logId = Math.random().toString(36).substring(2, 9);
    
    try {
      const result = this.executeSqlSimulation(cleanSql, params);
      
      this.queryLogs.unshift({
        id: logId,
        sql: cleanSql,
        params: JSON.stringify(params),
        timestamp,
        status: 'SUCCESS',
        rowsAffected: result.rowsAffected
      });

      // Keep only last 50 logs for memory performance
      if (this.queryLogs.length > 50) {
        this.queryLogs.pop();
      }

      return result.rows;
    } catch (err: any) {
      this.queryLogs.unshift({
        id: logId,
        sql: cleanSql,
        params: JSON.stringify(params),
        timestamp,
        status: 'ERROR',
        rowsAffected: 0,
        errorMessage: err.message
      });
      console.error(`SQLite local error: ${err.message}\nSQL: ${cleanSql}`);
      throw err;
    }
  }

  private executeSqlSimulation(sql: string, params: any[]): { rows: any[]; rowsAffected: number } {
    const upperSql = sql.toUpperCase();

    // 1. CREATE TABLE
    if (upperSql.startsWith('CREATE TABLE')) {
      const match = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
      if (!match) throw new Error('Sintaxis inválida en CREATE TABLE.');
      const tableName = match[1];
      const key = `${this.storagePrefix}${tableName}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify([]));
      }
      return { rows: [], rowsAffected: 0 };
    }

    // 2. INSERT INTO / REPLACE INTO / INSERT OR REPLACE INTO
    if (upperSql.startsWith('INSERT') || upperSql.startsWith('REPLACE')) {
      const isReplace = upperSql.includes('REPLACE');
      const tableMatch = sql.match(/(?:INSERT\s+(?:OR\s+REPLACE\s+)?INTO|REPLACE\s+INTO)\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      
      // Attempt generic INSERT parsing if standard format fails
      if (!tableMatch) {
        throw new Error('Sintaxis de INSERT/REPLACE no soportada por el emulador SQLite local.');
      }

      const tableName = tableMatch[1];
      const columns = tableMatch[2].split(',').map(c => c.trim());
      const rawValues = tableMatch[3].split(',');

      const valuesMapped = rawValues.map(val => {
        const trimmed = val.trim();
        if (trimmed === '?') {
          return params.shift();
        }
        // Remove single quotes if present
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
          return trimmed.slice(1, -1);
        }
        if (!isNaN(Number(trimmed))) {
          return Number(trimmed);
        }
        return trimmed;
      });

      const newRow: Record<string, any> = {};
      columns.forEach((col, idx) => {
        newRow[col] = valuesMapped[idx];
      });

      const key = `${this.storagePrefix}${tableName}`;
      const dataStr = localStorage.getItem(key) || '[]';
      let tableData = JSON.parse(dataStr) as any[];

      // Resolve primary keys
      let primaryKeys: string[] = [];
      if (tableName === 'temp_deck') {
        primaryKeys = ['deck_id', 'card_id'];
      } else if (tableName === 'user_config') {
        primaryKeys = ['key'];
      } else {
        primaryKeys = ['id'];
      }

      // Check duplicate primary keys
      const duplicateIdx = tableData.findIndex(row => 
        primaryKeys.every(pk => row[pk] === newRow[pk])
      );

      if (duplicateIdx !== -1) {
        if (isReplace || upperSql.includes('OR REPLACE')) {
          tableData[duplicateIdx] = { ...tableData[duplicateIdx], ...newRow };
        } else {
          throw new Error(`Restricción UNIQUE violada en clave primaria de tabla "${tableName}".`);
        }
      } else {
        tableData.push(newRow);
      }

      localStorage.setItem(key, JSON.stringify(tableData));
      return { rows: [], rowsAffected: 1 };
    }

    // 3. SELECT
    if (upperSql.startsWith('SELECT')) {
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (!fromMatch) throw new Error('Consulta SELECT requiere cláusula FROM.');
      const tableName = fromMatch[1];
      const key = `${this.storagePrefix}${tableName}`;
      const dataStr = localStorage.getItem(key);
      if (dataStr === null) {
        throw new Error(`Tabla "${tableName}" no existe en la base de datos SQLite.`);
      }
      let rows = JSON.parse(dataStr) as any[];

      // Parse WHERE clause (simplified: Support basic col = ? or col = 'val')
      const whereMatch = sql.match(/WHERE\s+([^ORDER|LIMIT|;]+)/i);
      if (whereMatch) {
        const whereClause = whereMatch[1].trim();
        const parts = whereClause.split(/\s*=\s*/);
        if (parts.length === 2) {
          const colName = parts[0].trim();
          let targetVal: any = parts[1].trim();
          
          if (targetVal === '?') {
            targetVal = params.shift();
          } else if (targetVal.startsWith("'") && targetVal.endsWith("'")) {
            targetVal = targetVal.slice(1, -1);
          } else if (!isNaN(Number(targetVal))) {
            targetVal = Number(targetVal);
          }

          rows = rows.filter(r => String(r[colName]) === String(targetVal));
        }
      }

      // Parse ORDER BY (simplified: Support basic ORDER BY column [DESC])
      const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
      if (orderMatch) {
        const col = orderMatch[1];
        const dir = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
        rows.sort((a, b) => {
          if (a[col] < b[col]) return -1 * dir;
          if (a[col] > b[col]) return 1 * dir;
          return 0;
        });
      }

      // Parse LIMIT
      const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        const limitVal = parseInt(limitMatch[1], 10);
        rows = rows.slice(0, limitVal);
      }

      return { rows, rowsAffected: 0 };
    }

    // 4. UPDATE
    if (upperSql.startsWith('UPDATE')) {
      const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
      if (!tableMatch) throw new Error('Sintaxis UPDATE inválida.');
      const tableName = tableMatch[1];
      const key = `${this.storagePrefix}${tableName}`;
      const dataStr = localStorage.getItem(key);
      if (dataStr === null) {
        throw new Error(`Tabla "${tableName}" no existe.`);
      }
      let rows = JSON.parse(dataStr) as any[];

      // Parse SET (simplified: col = ? or col = 'val')
      const setMatch = sql.match(/SET\s+([^WHERE;]+)/i);
      if (!setMatch) throw new Error('Cláusula SET requerida en UPDATE.');
      
      const setParts = setMatch[1].split(/\s*=\s*/);
      if (setParts.length !== 2) throw new Error('Emulador SQLite solo soporta asignación simple col = ? en UPDATE.');
      const setCol = setParts[0].trim();
      let setVal: any = setParts[1].trim();
      if (setVal === '?') {
        setVal = params.shift();
      } else if (setVal.startsWith("'") && setVal.endsWith("'")) {
        setVal = setVal.slice(1, -1);
      } else if (!isNaN(Number(setVal))) {
        setVal = Number(setVal);
      }

      // Parse WHERE clause
      const whereMatch = sql.match(/WHERE\s+([^;]+)/i);
      let updatedCount = 0;
      if (whereMatch) {
        const parts = whereMatch[1].trim().split(/\s*=\s*/);
        if (parts.length === 2) {
          const colName = parts[0].trim();
          let targetVal: any = parts[1].trim();
          if (targetVal === '?') {
            targetVal = params.shift();
          } else if (targetVal.startsWith("'") && targetVal.endsWith("'")) {
            targetVal = targetVal.slice(1, -1);
          }

          rows = rows.map(r => {
            if (String(r[colName]) === String(targetVal)) {
              updatedCount++;
              return { ...r, [setCol]: setVal };
            }
            return r;
          });
        }
      } else {
        // Update all
        rows = rows.map(r => {
          updatedCount++;
          return { ...r, [setCol]: setVal };
        });
      }

      localStorage.setItem(key, JSON.stringify(rows));
      return { rows: [], rowsAffected: updatedCount };
    }

    // 5. DELETE
    if (upperSql.startsWith('DELETE')) {
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (!fromMatch) throw new Error('Sintaxis DELETE inválida.');
      const tableName = fromMatch[1];
      const key = `${this.storagePrefix}${tableName}`;
      const dataStr = localStorage.getItem(key);
      if (dataStr === null) {
        throw new Error(`Tabla "${tableName}" no existe.`);
      }
      let rows = JSON.parse(dataStr) as any[];
      const originalCount = rows.length;

      // Parse WHERE clause
      const whereMatch = sql.match(/WHERE\s+([^;]+)/i);
      if (whereMatch) {
        const parts = whereMatch[1].trim().split(/\s*=\s*/);
        if (parts.length === 2) {
          const colName = parts[0].trim();
          let targetVal: any = parts[1].trim();
          if (targetVal === '?') {
            targetVal = params.shift();
          } else if (targetVal.startsWith("'") && targetVal.endsWith("'")) {
            targetVal = targetVal.slice(1, -1);
          }

          rows = rows.filter(r => String(r[colName]) !== String(targetVal));
        }
      } else {
        rows = [];
      }

      localStorage.setItem(key, JSON.stringify(rows));
      return { rows: [], rowsAffected: originalCount - rows.length };
    }

    throw new Error('Comando SQL no soportado o sintaxis inválida en el emulador SQLite local.');
  }

  // Diagnostics method to retrieve database metrics
  public getTableStats(): Record<string, number> {
    const tables = ['local_cards', 'user_config', 'local_matches', 'local_history', 'temp_deck'];
    const stats: Record<string, number> = {};
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      for (const t of tables) {
        stats[t] = 0;
      }
      return stats;
    }
    for (const t of tables) {
      const key = `${this.storagePrefix}${t}`;
      const dataStr = localStorage.getItem(key) || '[]';
      stats[t] = JSON.parse(dataStr).length;
    }
    return stats;
  }
}
