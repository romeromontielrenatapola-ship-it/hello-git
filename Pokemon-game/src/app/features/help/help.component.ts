import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SqliteLocalService, SqlQueryLog } from '../../core/services/sqlite-local.service';
import { AudioService } from '../../core/services/audio.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './help.component.html',
  styleUrl: './help.component.css'
})
export class HelpComponent implements OnInit {
  public readonly sqlite = inject(SqliteLocalService);
  public readonly audio = inject(AudioService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  // Active view tab: 'rules' or 'sqlite'
  public readonly activeTab = signal<'rules' | 'sqlite'>('rules');

  // Interactive SQL terminal states
  public sqlInput = signal<string>('SELECT * FROM local_cards;');
  public queryResultHeaders = signal<string[]>([]);
  public queryResultRows = signal<any[]>([]);
  public queryErrorMessage = signal<string | null>(null);
  public queryRowsAffected = signal<number | null>(null);
  public executionTimeMs = signal<number>(0);

  // Stats
  public tableStats = signal<Record<string, number>>({});

  ngOnInit(): void {
    this.audio.playClick();
    this.refreshStats();
  }

  public refreshStats(): void {
    this.tableStats.set(this.sqlite.getTableStats());
  }

  public setTab(tab: 'rules' | 'sqlite'): void {
    this.audio.playClick();
    this.activeTab.set(tab);
    if (tab === 'sqlite') {
      this.refreshStats();
    }
  }

  public async runSql(customSql?: string): Promise<void> {
    this.audio.playEnergyAttach();
    const query = (customSql || this.sqlInput()).trim();
    if (!query) return;

    const start = performance.now();
    this.queryErrorMessage.set(null);
    this.queryResultHeaders.set([]);
    this.queryResultRows.set([]);
    this.queryRowsAffected.set(null);

    try {
      const rows = await this.sqlite.query(query);
      const end = performance.now();
      this.executionTimeMs.set(Math.round((end - start) * 100) / 100);

      // Check if rows returned
      if (rows && rows.length > 0) {
        this.queryResultHeaders.set(Object.keys(rows[0]));
        this.queryResultRows.set(rows);
      } else {
        const lastLog = this.sqlite.queryLogs[0];
        if (lastLog) {
          this.queryRowsAffected.set(lastLog.rowsAffected);
        }
      }
      this.toast.success('Consulta ejecutada con éxito en SQLite.');
      this.refreshStats();
    } catch (err: any) {
      const end = performance.now();
      this.executionTimeMs.set(Math.round((end - start) * 100) / 100);
      this.queryErrorMessage.set(err.message || 'Error desconocido al ejecutar SQL.');
      this.toast.error('Falla en la consulta SQL.');
    }
  }

  public selectTemplate(template: string): void {
    this.audio.playClick();
    this.sqlInput.set(template);
    this.runSql(template);
  }

  public getQueryLogs(): SqlQueryLog[] {
    return this.sqlite.queryLogs;
  }

  public goBack(): void {
    this.audio.playClick();
    this.router.navigate(['/dashboard']);
  }
}
