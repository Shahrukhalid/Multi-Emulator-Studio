import { Device, Status } from '../types.js';
import { DeviceCardComponent, DeviceCardCallbacks } from './device_card.js';
import { Icons } from '../icons.js';

export interface DeviceListCallbacks extends DeviceCardCallbacks {
  onCreateClick: () => void;
}

export class DeviceListComponent {
  private element: HTMLElement;
  private devices: Device[] = [];
  private statuses: Status[] = [];
  private callbacks: DeviceListCallbacks;
  private cardInstances: Map<string, DeviceCardComponent> = new Map();
  private searchTerm = '';
  private viewMode: 'grid' | 'list' = 'grid';
  private filterStatus: 'all' | 'running' | 'stopped' = 'all';
  private sortBy: 'newest' | 'name' = 'newest';

  constructor(callbacks: DeviceListCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'device-library-view';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setData(devices: Device[], statuses: Status[]): void {
    this.devices = devices;
    this.statuses = statuses;
    this.updateGrid();
  }

  updateSingleStatus(status: Status): void {
    const idx = this.statuses.findIndex((s) => s.id === status.id);
    if (idx !== -1) {
      this.statuses[idx] = status;
    } else {
      this.statuses.push(status);
    }
    const card = this.cardInstances.get(status.id);
    if (card) {
      card.updateStatus(status);
    }
    this.updateSummary();
  }

  setDeviceBusy(id: string, busy: boolean): void {
    const card = this.cardInstances.get(id);
    if (card) {
      card.setBusy(busy);
    }
  }

  private render(): void {
    const statusMap = new Map<string, Status>();
    for (const s of this.statuses) statusMap.set(s.id, s);

    const runningCount = this.devices.filter((d) => statusMap.get(d.id)?.state === 'ready').length;
    const stoppedCount = this.devices.length - runningCount;

    this.element.innerHTML = `
      <section class="workspace-overview" aria-label="Device workspace overview">
        <div class="workspace-intro">
          <span class="workspace-kicker">DEVICE MANAGER</span>
          <h1>My Devices</h1>
          <p>Manage your virtual Android and iOS devices with high-speed proxy and location control.</p>
        </div>

        <div class="workspace-stats">
          <div class="workspace-stat"><span>Total Devices</span><strong id="stat-devices">${this.devices.length}</strong></div>
          <div class="workspace-stat"><span>Active / Running</span><strong id="stat-ready">${runningCount}</strong></div>
          <div class="workspace-stat"><span>Stopped</span><strong id="stat-queued">${stoppedCount}</strong></div>
        </div>
      </section>

      <!-- Toolbar with Filter Pills & Controls matching master datasheet -->
      <div class="toolbar-bar">
        <div class="devices-filter-pills">
          <button class="filter-pill ${this.filterStatus === 'all' ? 'active' : ''}" data-status-filter="all">
            All (<span id="filter-count-all">${this.devices.length}</span>)
          </button>
          <button class="filter-pill ${this.filterStatus === 'running' ? 'active' : ''}" data-status-filter="running">
            Running (<span id="filter-count-running">${runningCount}</span>)
          </button>
          <button class="filter-pill ${this.filterStatus === 'stopped' ? 'active' : ''}" data-status-filter="stopped">
            Stopped (<span id="filter-count-stopped">${stoppedCount}</span>)
          </button>
        </div>

        <div class="search-field">
          ${Icons.search}
          <input type="text" id="devices-search-input" aria-label="Search devices" placeholder="Search devices by name or version..." value="${this.escapeHtml(this.searchTerm)}" />
        </div>

        <div class="sort-selector-wrapper">
          <span style="font-size: 11px; color: var(--text-tertiary);">Sort:</span>
          <select class="form-select-input sort-select" id="devices-sort-select">
            <option value="newest" ${this.sortBy === 'newest' ? 'selected' : ''}>Newest</option>
            <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>Name A-Z</option>
          </select>
        </div>

        <div class="view-mode-toggle">
          <button class="mode-btn ${this.viewMode === 'grid' ? 'active' : ''}" id="btn-mode-grid" title="Grid view">
            ${Icons.grid}
          </button>
          <button class="mode-btn ${this.viewMode === 'list' ? 'active' : ''}" id="btn-mode-list" title="List view">
            ${Icons.list}
          </button>
        </div>

        <button class="btn-create-primary" id="btn-list-create">
          ${Icons.plus}
          <span>Create Device</span>
        </button>
      </div>

      <div class="device-grid ${this.viewMode === 'list' ? 'list-view' : ''}" id="devices-cards-grid"></div>
    `;

    // Filter pills
    this.element.querySelectorAll<HTMLButtonElement>('[data-status-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filterStatus = btn.dataset.statusFilter as typeof this.filterStatus;
        this.render();
      });
    });

    // Search input
    const searchInput = this.element.querySelector('#devices-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.searchTerm = searchInput.value.toLowerCase().trim();
      this.updateGrid();
    });

    // Sort select
    const sortSelect = this.element.querySelector('#devices-sort-select') as HTMLSelectElement;
    sortSelect?.addEventListener('change', () => {
      this.sortBy = sortSelect.value as typeof this.sortBy;
      this.updateGrid();
    });

    // View toggles
    this.element.querySelector('#btn-mode-grid')?.addEventListener('click', () => {
      this.viewMode = 'grid';
      this.element.querySelector('#btn-mode-grid')?.classList.add('active');
      this.element.querySelector('#btn-mode-list')?.classList.remove('active');
      const grid = this.element.querySelector('#devices-cards-grid');
      if (grid) grid.className = 'device-grid';
    });

    this.element.querySelector('#btn-mode-list')?.addEventListener('click', () => {
      this.viewMode = 'list';
      this.element.querySelector('#btn-mode-list')?.classList.add('active');
      this.element.querySelector('#btn-mode-grid')?.classList.remove('active');
      const grid = this.element.querySelector('#devices-cards-grid');
      if (grid) grid.className = 'device-grid list-view';
    });

    this.element.querySelector('#btn-list-create')?.addEventListener('click', () => {
      this.callbacks.onCreateClick();
    });

    this.updateGrid();
  }

  private updateGrid(): void {
    this.updateSummary();
    const gridContainer = this.element.querySelector('#devices-cards-grid');
    if (!gridContainer) return;

    this.cardInstances.clear();
    gridContainer.innerHTML = '';

    const statusMap = new Map<string, Status>();
    for (const s of this.statuses) {
      statusMap.set(s.id, s);
    }

    let list = this.devices.filter((d) => {
      const state = statusMap.get(d.id)?.state;
      if (this.filterStatus === 'running' && state !== 'ready') return false;
      if (this.filterStatus === 'stopped' && state === 'ready') return false;

      if (!this.searchTerm) return true;
      return (
        d.spec.name.toLowerCase().includes(this.searchTerm) ||
        d.spec.image.toLowerCase().includes(this.searchTerm) ||
        d.spec.hardware_profile.toLowerCase().includes(this.searchTerm)
      );
    });

    if (this.sortBy === 'name') {
      list = [...list].sort((a, b) => a.spec.name.localeCompare(b.spec.name));
    }

    if (list.length === 0) {
      gridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-secondary);">
          <p style="font-size: 15px; font-weight: 500;">No devices found</p>
          <p style="font-size: 13px; color: var(--text-tertiary); margin-top: 4px;">Adjust your filters or click "+ Create Device" to add a new device.</p>
        </div>
      `;
      return;
    }

    for (const d of list) {
      const card = new DeviceCardComponent(d, statusMap.get(d.id) ?? null, this.callbacks);
      this.cardInstances.set(d.id, card);
      gridContainer.appendChild(card.getElement());
    }
  }

  private updateSummary(): void {
    const known = new Set(this.devices.map((device) => device.id));
    const statuses = this.statuses.filter((status) => known.has(status.id));
    const runningCount = statuses.filter((status) => status.state === 'ready' && !status.diagnostic).length;
    const stoppedCount = statuses.filter((status) => status.state === 'stopped' || !status.state).length;
    const counts = {
      'stat-devices': this.devices.length,
      'stat-ready': runningCount,
      'stat-queued': stoppedCount,
      'filter-count-all': this.devices.length,
      'filter-count-running': runningCount,
      'filter-count-stopped': stoppedCount
    };
    for (const [id, value] of Object.entries(counts)) {
      const element = this.element.querySelector(`#${id}`);
      if (element) element.textContent = String(value);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
