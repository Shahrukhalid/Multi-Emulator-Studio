import { Icons } from '../icons.js';

export type MainNavTab = 'devices' | 'templates' | 'settings';

export interface HeaderProps {
  activeTab: MainNavTab;
  isPreview: boolean;
  onTabSelect: (tab: MainNavTab) => void;
  onCreateClick: () => void;
}

export class HeaderComponent {
  private element: HTMLElement;
  private props: HeaderProps;

  constructor(props: HeaderProps) {
    this.props = props;
    this.element = document.createElement('header');
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setTab(tab: MainNavTab): void {
    this.props.activeTab = tab;
    this.element.querySelectorAll('.nav-item').forEach((item) => {
      const target = item.getAttribute('data-tab');
      if (target === tab) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  private render(): void {
    const previewBanner = this.props.isPreview
      ? `<div class="preview-banner">
           Running in Browser Preview Mode · Read-only interface design inspection
         </div>`
      : '';

    this.element.innerHTML = `
      ${previewBanner}
      <div class="app-titlebar">
        <div class="brand-group">
          <div class="brand-icon-box">
            ${Icons.android}
          </div>
          <span class="brand-name">Multi-Emulator Studio</span>
        </div>

        <nav class="primary-nav">
          <button class="nav-item ${this.props.activeTab === 'devices' ? 'active' : ''}" data-tab="devices">
            ${Icons.devices}
            <span>My Devices</span>
          </button>
          <button class="nav-item ${this.props.activeTab === 'templates' ? 'active' : ''}" data-tab="templates">
            ${Icons.templates}
            <span>Templates</span>
          </button>
          <button class="nav-item ${this.props.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
            ${Icons.settings}
            <span>Settings</span>
          </button>
        </nav>

        <div class="titlebar-actions">
          <button id="btn-header-create" class="btn-create-primary">
            ${Icons.plus}
            <span>Create Device</span>
          </button>
        </div>
      </div>
    `;

    this.element.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as MainNavTab;
        this.setTab(tab);
        this.props.onTabSelect(tab);
      });
    });

    this.element.querySelector('#btn-header-create')?.addEventListener('click', () => {
      this.props.onCreateClick();
    });
  }
}
