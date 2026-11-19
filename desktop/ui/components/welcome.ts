import { Illustrations } from '../illustrations.js';
import { Icons } from '../icons.js';
import { HostInfo } from '../types.js';

export interface WelcomeProps {
  host: HostInfo | null;
  onSelectAndroid: () => void;
  onSelectIos: () => void;
}

export class WelcomeComponent {
  private element: HTMLElement;
  private props: WelcomeProps;

  constructor(props: WelcomeProps) {
    this.props = props;
    this.element = document.createElement('div');
    this.element.className = 'welcome-hero';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    const isMac = this.props.host?.os === 'macos';

    this.element.innerHTML = `
      <div style="display: flex; justify-content: center; margin-bottom: 24px;">
        ${Illustrations.welcomeHero}
      </div>

      <h1 class="welcome-title">Welcome to Multi-Emulator Studio</h1>
      <p class="welcome-subtitle">Your virtual devices, all in one place.</p>

      <div class="platform-choice-grid">
        <!-- Android Option -->
        <div class="platform-card" id="choice-android">
          <div class="platform-icon-wrap" style="color: #10b981;">
            ${Icons.android}
          </div>
          <div class="platform-name">Android Device</div>
          <div class="platform-desc">
            Create an Android phone, tablet, or foldable virtual device backed by official Android emulator tools.
          </div>
          <div class="platform-badge active">
            <span>Ready · Real Emulator</span>
          </div>
        </div>

        <!-- iOS Simulator Option -->
        <div class="platform-card ${isMac ? '' : 'disabled'}" id="choice-ios">
          <div class="platform-icon-wrap" style="color: var(--text-secondary);">
            ${Icons.apple}
          </div>
          <div class="platform-name">iPhone & iPad Simulator</div>
          <div class="platform-desc">
            ${
              isMac
                ? 'Run iOS and iPadOS simulators directly via Apple Xcode toolchain.'
                : 'Apple iOS Simulator requires macOS with Xcode installed. Currently running on Windows / non-macOS.'
            }
          </div>
          <div class="platform-badge notice">
            <span>${isMac ? 'Requires Xcode' : 'macOS Only'}</span>
          </div>
        </div>
      </div>
    `;

    this.element.querySelector('#choice-android')?.addEventListener('click', () => {
      this.props.onSelectAndroid();
    });

    this.element.querySelector('#choice-ios')?.addEventListener('click', () => {
      if (isMac) {
        this.props.onSelectIos();
      }
    });
  }
}
