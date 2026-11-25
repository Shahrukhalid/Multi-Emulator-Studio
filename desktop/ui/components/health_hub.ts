import { IApiClient } from '../api.js';
import { PreflightReport, HealthCheck } from '../types.js';
import { Icons } from '../icons.js';
import { toast } from '../toast.js';

export class HealthHubComponent {
  private element = document.createElement('div');
  private report: PreflightReport | null = null;
  private activeCategory: string = 'all';
  private loading = false;

  constructor(private api: IApiClient) {
    this.element.className = 'health-hub-view';
    this.render();
    this.refresh();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.render();
    try {
      this.report = await this.api.getPreflightReport();
    } catch (err: unknown) {
      toast.show(`Preflight scan failed: ${(err as { message?: string }).message || String(err)}`, 'error');
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private filterChecks(): HealthCheck[] {
    if (!this.report) return [];
    if (this.activeCategory === 'all') return this.report.checks;
    return this.report.checks.filter((c) => c.category === this.activeCategory);
  }

  private render(): void {
    const report = this.report;
    const overall = report?.overall || 'warn';

    const overallBadge = !report
      ? `<span class="health-badge status-warn">${Icons.rotate} Running Preflight Scan…</span>`
      : overall === 'pass'
      ? `<span class="health-badge status-pass">${Icons.check} All Systems Operational</span>`
      : overall === 'warn'
      ? `<span class="health-badge status-warn">${Icons.warning} System Actions Recommended</span>`
      : `<span class="health-badge status-fail">${Icons.delete} Critical Attention Required</span>`;

    const checks = this.filterChecks();

    this.element.innerHTML = `
      <section class="section-container health-hub-section" aria-label="Preflight Health Hub">
        <header class="section-header">
          <div class="header-content">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="brand-icon-box" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                ${Icons.shield}
              </div>
              <div>
                <h1 class="page-title">Preflight Health Hub</h1>
                <p class="page-subtitle">Hardware Virtualization, Hypervisor Readiness, and Toolchain Diagnostics</p>
              </div>
            </div>
            <div class="header-actions">
              <button class="btn-secondary-action" id="btn-health-refresh" ${this.loading ? 'disabled' : ''}>
                ${Icons.rotate}
                <span>${this.loading ? 'Scanning...' : 'Re-run Diagnostics'}</span>
              </button>
            </div>
          </div>
        </header>

        <!-- Executive Summary Banner -->
        <div class="health-summary-banner">
          <div class="summary-left">
            <div class="summary-status-row">
              <span class="summary-label">Studio Health Status:</span>
              ${overallBadge}
            </div>
            <p class="summary-description">
              Live checks for VT-x / AMD-V / Hyper-V / KVM / Apple Hypervisor, Android CLI tools, and host compute resources.
            </p>
          </div>
          <div class="summary-stats-grid">
            <div class="summary-stat-box">
              <span class="stat-number">${report?.checks.filter((c) => c.status === 'pass').length || 0}</span>
              <span class="stat-label">Passed</span>
            </div>
            <div class="summary-stat-box warn">
              <span class="stat-number">${report?.checks.filter((c) => c.status === 'warn').length || 0}</span>
              <span class="stat-label">Warnings</span>
            </div>
            <div class="summary-stat-box fail">
              <span class="stat-number">${report?.checks.filter((c) => c.status === 'fail').length || 0}</span>
              <span class="stat-label">Errors</span>
            </div>
          </div>
        </div>

        <!-- Host System Specs Pill Bar -->
        <div class="host-specs-bar">
          <span class="spec-pill"><strong>OS:</strong> ${report?.host_os || 'Detecting...'} (${report?.host_arch || ''})</span>
          <span class="spec-pill"><strong>Logical Cores:</strong> ${report?.cpu_cores || 0}</span>
          <span class="spec-pill"><strong>Physical RAM:</strong> ${report?.ram_mb ? `${(report.ram_mb / 1024).toFixed(1)} GB` : 'N/A'}</span>
          <span class="spec-pill"><strong>Free Storage:</strong> ${report?.disk_mb ? `${(report.disk_mb / 1024).toFixed(1)} GB` : 'N/A'}</span>
        </div>

        <!-- Category Filter Tabs -->
        <div class="health-category-tabs">
          <button class="health-tab-btn ${this.activeCategory === 'all' ? 'active' : ''}" data-cat="all">All Diagnostics (${report?.checks.length || 0})</button>
          <button class="health-tab-btn ${this.activeCategory === 'virtualization' ? 'active' : ''}" data-cat="virtualization">Virtualization & Hypervisor</button>
          <button class="health-tab-btn ${this.activeCategory === 'sdk' ? 'active' : ''}" data-cat="sdk">Android SDK & CLI</button>
          <button class="health-tab-btn ${this.activeCategory === 'resources' ? 'active' : ''}" data-cat="resources">System Resources</button>
          <button class="health-tab-btn ${this.activeCategory === 'apple_ios' ? 'active' : ''}" data-cat="apple_ios">Apple iOS Simulator</button>
        </div>

        <!-- Diagnostic Check Cards Grid -->
        <div class="health-cards-grid">
          ${
            checks.length === 0
              ? `<div class="empty-health-state"><p>No diagnostic items found for selected filter.</p></div>`
              : checks
                  .map(
                    (check) => `
              <article class="health-check-card ${check.status}" data-id="${check.id}">
                <div class="check-card-header">
                  <div class="check-card-title-group">
                    <span class="check-status-dot ${check.status}"></span>
                    <h3 class="check-title">${this.escapeHtml(check.title)}</h3>
                  </div>
                  <span class="check-status-tag ${check.status}">${check.status.toUpperCase()}</span>
                </div>
                <p class="check-summary">${this.escapeHtml(check.summary)}</p>
                ${
                  check.details
                    ? `<pre class="check-details-box">${this.escapeHtml(check.details)}</pre>`
                    : ''
                }
                ${
                  check.remediation
                    ? `<div class="check-remediation-box">
                        <div class="remediation-header">
                          <span class="remediation-label">Actionable Remediation:</span>
                          <button class="btn-copy-remediation" data-cmd="${this.escapeHtml(check.remediation)}" title="Copy remediation command">
                            ${Icons.copy}
                            <span>Copy Command</span>
                          </button>
                        </div>
                        <code class="remediation-code">${this.escapeHtml(check.remediation)}</code>
                      </div>`
                    : ''
                }
              </article>
            `
                  )
                  .join('')
          }
        </div>
      </section>
    `;

    // Hook listeners
    this.element.querySelector('#btn-health-refresh')?.addEventListener('click', () => this.refresh());

    this.element.querySelectorAll('.health-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.getAttribute('data-cat') || 'all';
        this.render();
      });
    });

    this.element.querySelectorAll('.btn-copy-remediation').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        if (cmd) {
          navigator.clipboard.writeText(cmd);
          toast.show('Remediation command copied to clipboard!', 'success');
        }
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
