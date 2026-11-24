import {
  MatrixTestSuite,
  MatrixDeviceSnapshot,
  MatrixRunReport,
  BroadcastInstallReport,
  SynchronizedScreenshotsReport
} from '../types.js';
import { Icons } from '../icons.js';

export interface TestMatrixCallbacks {
  onRunMatrix: () => void;
  onSelectStep: (suiteId: string, stepId: string) => void;
  onBroadcastApk?: () => void;
  onCaptureSynchronized?: () => void;
  onExportReport?: () => void;
}

export class TestMatrixComponent {
  private element: HTMLElement;
  private suites: MatrixTestSuite[] = [];
  private devices: MatrixDeviceSnapshot[] = [];
  private selectedSuiteId = 'sales';
  private selectedStepId = 'sales_tap_sales';
  private activeFilter: 'all' | 'passed' | 'failed' = 'all';
  private zoomLevel: 'small' | 'medium' | 'large' = 'medium';
  private isRunning = false;
  private broadcastReport: BroadcastInstallReport | null = null;

  constructor(private callbacks: TestMatrixCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'test-matrix-view';
    this.loadSampleMatrixData();
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private loadSampleMatrixData(): void {
    this.suites = [
      {
        id: 'customers',
        name: 'Customer tests',
        steps: [
          { id: 'cust_details', suite: 'customers', title: 'Check Customer Details', status: 'passed', durationMs: 320 },
          { id: 'cust_nav', suite: 'customers', title: 'Check Customer Navigation', status: 'passed', durationMs: 180 },
          { id: 'cust_phone', suite: 'customers', title: 'Check Customer Phone', status: 'passed', durationMs: 210 },
          { id: 'cust_investigate', suite: 'customers', title: 'Investigate Customer Page', status: 'passed', durationMs: 450 }
        ]
      },
      {
        id: 'sales',
        name: 'Sales tests',
        steps: [
          { id: 'sales_launch', suite: 'sales', title: 'First launch the app', status: 'failed', durationMs: 840 },
          { id: 'sales_tap_sales', suite: 'sales', title: 'Then I tap "Sales"', status: 'running', durationMs: 210 },
          { id: 'sales_tap_add', suite: 'sales', title: 'Then I tap "add"', status: 'pending' },
          { id: 'sales_choose_first', suite: 'sales', title: 'Then I choose the first result', status: 'pending' },
          { id: 'sales_type_desc', suite: 'sales', title: 'Then I write the title and description', status: 'pending' },
          { id: 'sales_tap_save', suite: 'sales', title: 'Then I tap "Save"', status: 'pending' },
          { id: 'sales_tap_back', suite: 'sales', title: 'Then I tap "Back"', status: 'pending' }
        ]
      },
      {
        id: 'orders',
        name: 'Order tests',
        steps: [
          { id: 'order_add', suite: 'orders', title: 'Add New Order', status: 'passed', durationMs: 390 },
          { id: 'order_deliver', suite: 'orders', title: 'Add New Order And Deliver', status: 'passed', durationMs: 410 },
          { id: 'order_status', suite: 'orders', title: 'Deliver Order', status: 'passed', durationMs: 220 },
          { id: 'order_edit', suite: 'orders', title: 'Edit Customer Order', status: 'passed', durationMs: 340 }
        ]
      }
    ];

    this.devices = [
      { deviceId: 'dev-1', deviceName: 'Apple iPhone 15 Pro', osVersion: 'iOS 17.4', formFactor: 'phone', status: 'failed', errorStepId: 'sales_launch' },
      { deviceId: 'dev-2', deviceName: 'Google Pixel 8 Pro', osVersion: 'Android 15', formFactor: 'phone', status: 'passed' },
      { deviceId: 'dev-3', deviceName: 'Samsung Galaxy S24', osVersion: 'Android 14', formFactor: 'phone', status: 'passed' },
      { deviceId: 'dev-4', deviceName: 'Google Pixel 7', osVersion: 'Android 14', formFactor: 'phone', status: 'passed' },
      { deviceId: 'dev-5', deviceName: 'Pixel Tablet', osVersion: 'Android 15', formFactor: 'tablet', status: 'passed' },
      { deviceId: 'dev-6', deviceName: 'Apple iPad Air', osVersion: 'iOS 17.2', formFactor: 'tablet', status: 'passed' },
      { deviceId: 'dev-7', deviceName: 'Nexus 5X (Legacy)', osVersion: 'Android 8.1', formFactor: 'phone', status: 'passed' },
      { deviceId: 'dev-8', deviceName: 'Pixel Fold', osVersion: 'Android 15', formFactor: 'foldable', status: 'passed' }
    ];
  }

  private render(): void {
    const filteredDevices = this.devices.filter((d) => {
      if (this.activeFilter === 'passed') return d.status === 'passed';
      if (this.activeFilter === 'failed') return d.status === 'failed';
      return true;
    });

    this.element.innerHTML = `
      <!-- Matrix Header Toolbar (Xamarin Test Cloud style) -->
      <div class="matrix-header-bar">
        <div class="matrix-breadcrumb">
          <span class="matrix-cloud-icon">${Icons.matrix}</span>
          <span class="matrix-title">Parallel Test Matrix</span>
          <span class="matrix-divider">/</span>
          <span class="matrix-run-id">Smoke Test Suite · 100% Free & Local Execution</span>
        </div>

        <div class="matrix-top-actions">
          <div class="matrix-filter-pills">
            <button class="filter-pill ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">All (${this.devices.length})</button>
            <button class="filter-pill ${this.activeFilter === 'passed' ? 'active' : ''}" data-filter="passed">Passed (${this.devices.filter((d) => d.status === 'passed').length})</button>
            <button class="filter-pill ${this.activeFilter === 'failed' ? 'active' : ''}" data-filter="failed">Failed (${this.devices.filter((d) => d.status === 'failed').length})</button>
          </div>

          <div class="matrix-zoom-control">
            <span style="font-size: 11px; color: var(--text-tertiary);">Zoom:</span>
            <button class="zoom-btn ${this.zoomLevel === 'small' ? 'active' : ''}" data-zoom="small">S</button>
            <button class="zoom-btn ${this.zoomLevel === 'medium' ? 'active' : ''}" data-zoom="medium">M</button>
            <button class="zoom-btn ${this.zoomLevel === 'large' ? 'active' : ''}" data-zoom="large">L</button>
          </div>

          <button class="filter-pill" id="btn-broadcast-apk" title="Install an APK across all devices simultaneously" style="display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 10px; cursor: pointer;">
            ${Icons.download}
            <span>Broadcast APK</span>
          </button>
          <button class="filter-pill" id="btn-sync-screenshots" title="Capture simultaneous screenshots across all active devices to compare responsive layouts" style="display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 10px; cursor: pointer;">
            ${Icons.camera}
            <span>Capture All</span>
          </button>
          <button class="filter-pill" id="btn-export-matrix-report" title="Export complete self-contained HTML test report" style="display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 10px; cursor: pointer;">
            ${Icons.external}
            <span>Export Report</span>
          </button>

          <button class="btn-create-primary" id="btn-run-matrix-tests" ${this.isRunning ? 'disabled style="opacity:0.7;"' : ''}>
            ${Icons.play}
            <span>${this.isRunning ? 'Executing Tests (Free)...' : 'Run Matrix Test (Free)'}</span>
          </button>
        </div>
      </div>

      ${this.broadcastReport ? `
      <div class="matrix-broadcast-banner" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; margin: 8px 16px 0; background: var(--color-primary-subtle); border: 1px solid var(--border-subtle); border-radius: 8px; font-size: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📦</span>
          <strong>Fleet Broadcast:</strong>
          <span>Installed <code>${this.broadcastReport.package_name}</code> on ${this.broadcastReport.successful_devices}/${this.broadcastReport.total_devices} devices in ${this.broadcastReport.total_duration_ms}ms</span>
        </div>
        <button id="btn-dismiss-broadcast" class="filter-pill" style="padding: 2px 8px; font-size: 11px;">✕</button>
      </div>
      ` : ''}

      <!-- Matrix Workspace Layout -->
      <div class="matrix-layout">
        <!-- Left Hierarchical Test Sidebar (Xamarin style) -->
        <aside class="matrix-sidebar">
          <div class="sidebar-header">
            <span>TEST STEPS</span>
            <span class="badge-subtle">${this.suites.length} Suites</span>
          </div>

          <div class="suite-list">
            ${this.suites
              .map(
                (suite) => {
                  const hasFailed = suite.steps.some(s => s.status === 'failed');
                  const allPassed = suite.steps.every(s => s.status === 'passed');
                  const iconStatus = hasFailed ? 'failed' : allPassed ? 'passed' : 'running';

                  return `
              <div class="suite-group">
                <div class="suite-title">
                  <strong>${suite.name}</strong>
                  <span class="suite-status-icon ${iconStatus}">
                    ${hasFailed ? '✕' : allPassed ? '✓' : '●'}
                  </span>
                </div>
                <div class="step-list">
                  ${suite.steps
                    .map(
                      (step) => `
                    <div class="step-item ${step.id === this.selectedStepId ? 'active' : ''}" data-step-id="${step.id}" data-suite-id="${suite.id}">
                      <span class="step-indicator ${step.status}"></span>
                      <span class="step-name">${step.title}</span>
                      ${step.durationMs ? `<span class="step-duration">${step.durationMs}ms</span>` : ''}
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            `;
                }
              )
              .join('')}
          </div>
        </aside>

        <!-- Main Synchronized Device Matrix Grid -->
        <main class="matrix-grid-stage zoom-${this.zoomLevel}">
          <div class="matrix-stage-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="step-dot in_progress"></span>
              <strong style="font-size: 14px;">Active Step: Then I tap "Sales"</strong>
            </div>
            <span style="font-size: 12px; color: var(--text-secondary);">Unlimited parallel execution · 100% Free & Local</span>
          </div>

          <div class="matrix-devices-grid">
            ${filteredDevices
              .map(
                (dev) => `
              <div class="matrix-device-card ${dev.status}">
                <div class="matrix-card-status-badge ${dev.status}">
                  ${dev.status === 'passed' ? '✓ Passed' : dev.status === 'failed' ? '✕ Failed' : '● Running'}
                </div>

                <div class="matrix-phone-mockup">
                  <div class="matrix-phone-screen">
                    ${
                      dev.screenshot
                        ? `<img src="data:image/png;base64,${dev.screenshot}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" alt="${dev.deviceName} Screen" />`
                        : `<div class="matrix-screen-placeholder">
                            <div class="screen-stat-chart">
                              <div class="bar bar-1"></div>
                              <div class="bar bar-2"></div>
                              <div class="bar bar-3"></div>
                              <div class="bar bar-4"></div>
                            </div>
                            <span class="screen-label">${dev.deviceName.split(' ')[0]}</span>
                          </div>`
                    }
                  </div>
                </div>

                <div class="matrix-device-meta">
                  <strong class="matrix-dev-name">${dev.deviceName}</strong>
                  <span class="matrix-dev-os">${dev.osVersion}</span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </main>
      </div>
    `;

    // Filter pills
    this.element.querySelectorAll<HTMLButtonElement>('.filter-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeFilter = btn.dataset.filter as typeof this.activeFilter;
        this.render();
      });
    });

    // Zoom buttons
    this.element.querySelectorAll<HTMLButtonElement>('.zoom-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.zoomLevel = btn.dataset.zoom as typeof this.zoomLevel;
        this.render();
      });
    });

    // Step item selection
    this.element.querySelectorAll<HTMLElement>('.step-item').forEach((item) => {
      item.addEventListener('click', () => {
        const stepId = item.dataset.stepId;
        const suiteId = item.dataset.suiteId;
        if (stepId && suiteId) {
          this.selectedStepId = stepId;
          this.selectedSuiteId = suiteId;
          this.callbacks.onSelectStep(suiteId, stepId);
          this.render();
        }
      });
    });

    // Run button
    this.element.querySelector('#btn-run-matrix-tests')?.addEventListener('click', () => {
      if (!this.isRunning) {
        this.callbacks.onRunMatrix();
      }
    });

    // Broadcast APK button
    this.element.querySelector('#btn-broadcast-apk')?.addEventListener('click', () => {
      this.callbacks.onBroadcastApk?.();
    });

    // Synchronized screenshots button
    this.element.querySelector('#btn-sync-screenshots')?.addEventListener('click', () => {
      this.callbacks.onCaptureSynchronized?.();
    });

    // Export report button
    this.element.querySelector('#btn-export-matrix-report')?.addEventListener('click', () => {
      this.callbacks.onExportReport?.();
    });

    // Dismiss broadcast banner button
    this.element.querySelector('#btn-dismiss-broadcast')?.addEventListener('click', () => {
      this.broadcastReport = null;
      this.render();
    });
  }

  public setRunning(running: boolean): void {
    this.isRunning = running;
    this.render();
  }

  public applyBroadcastReport(report: BroadcastInstallReport): void {
    this.broadcastReport = report;
    this.render();
  }

  public applySynchronizedScreenshots(report: SynchronizedScreenshotsReport): void {
    if (!report.frames.length) return;
    this.devices = report.frames.map((frame) => ({
      deviceId: frame.device_id,
      deviceName: frame.device_name,
      osVersion: frame.hardware_profile,
      formFactor: (frame.width > 1600 || frame.height > 2000 ? 'tablet' : 'phone') as 'phone' | 'tablet' | 'foldable',
      status: frame.state === 'ready' ? 'passed' : 'failed',
      screenshot: frame.png_base64,
    }));
    this.render();
  }

  public applyReport(report: MatrixRunReport): void {
    this.isRunning = false;
    this.devices = report.devices.map((d) => ({
      deviceId: d.device_id,
      deviceName: d.device_name,
      osVersion: 'Android 15',
      formFactor: 'phone',
      status: d.status === 'passed' ? 'passed' : 'failed',
      screenshot: d.latest_screenshot || undefined,
      errorMessage: d.steps.find((s) => s.error)?.error || undefined
    }));
    this.render();
  }
}
