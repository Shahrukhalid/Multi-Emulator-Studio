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
    this.element.innerHTML = `
      <section class="workspace-overview" aria-label="Device workspace overview">
        <div class="workspace-intro"><span class="workspace-kicker">YOUR WORKSPACE</span><h1>My devices</h1><p>Launch, manage and interact with your virtual Android devices.</p></div>
        <div class="workspace-stats"><div class="workspace-stat"><span>Devices</span><strong id="stat-devices">0</strong></div><div class="workspace-stat"><span>Ready</span><strong id="stat-ready">0</strong></div><div class="workspace-stat"><span>Starting / queued</span><strong id="stat-queued">0</strong></div></div>
      </section>
      <div class="toolbar-bar">
        <div class="search-field">
          ${Icons.search}
          <input type="text" id="devices-search-input" aria-label="Search devices" placeholder="Search devices by name or version..." />
        </div>

        <div class="view-mode-toggle">
          <button class="mode-btn ${this.viewMode === 'grid' ? 'active' : ''}" id="btn-mode-grid" title="Grid view">
            ${Icons.grid}
          </button>
          <button class="mode-btn ${this.viewMode === 'list' ? 'active' : ''}" id="btn-mode-list" title="List view">
            ${Icons.list}
          </button>
        </div>
      </div>

      <div class="device-grid" id="devices-cards-grid"></div>
    `;

    const searchInput = this.element.querySelector('#devices-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.searchTerm = searchInput.value.toLowerCase().trim();
      this.updateGrid();
    });

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

    const filtered = this.devices.filter((d) => {
      if (!this.searchTerm) return true;
      return (
        d.spec.name.toLowerCase().includes(this.searchTerm) ||
        d.spec.image.toLowerCase().includes(this.searchTerm) ||
        d.spec.hardware_profile.toLowerCase().includes(this.searchTerm)
      );
    });

    if (filtered.length === 0) {
      gridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-secondary);">
          <p style="font-size: 15px; font-weight: 500;">No devices match "${this.escapeHtml(this.searchTerm)}"</p>
          <p style="font-size: 13px; color: var(--text-tertiary); margin-top: 4px;">Check your search query or clear the filter.</p>
        </div>
      `;
      return;
    }

    for (const d of filtered) {
      const card = new DeviceCardComponent(d, statusMap.get(d.id) ?? null, this.callbacks);
      this.cardInstances.set(d.id, card);
      gridContainer.appendChild(card.getElement());
    }
  }

  private updateSummary(): void {
    const known = new Set(this.devices.map(device => device.id));
    const statuses = this.statuses.filter(status => known.has(status.id));
    const counts = { 'stat-devices': this.devices.length, 'stat-ready': statuses.filter(status => status.state === 'ready' && !status.diagnostic).length, 'stat-queued': statuses.filter(status => status.state === 'starting' || status.state === 'queued').length };
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
