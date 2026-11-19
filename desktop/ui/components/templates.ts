import { CURATED_TEMPLATES, CuratedTemplate, DevicePreset } from '../types.js';
import { Illustrations } from '../illustrations.js';

export interface TemplatesCallbacks {
  onUseTemplate: (preset: DevicePreset) => void;
}

export class TemplatesComponent {
  private element: HTMLElement;
  private callbacks: TemplatesCallbacks;

  constructor(callbacks: TemplatesCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'templates-view';
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Device Templates</h2>
          <p class="view-subtitle">Quickly launch pre-configured Android virtual devices optimized for common testing workflows.</p>
        </div>
      </div>

      <div class="templates-grid">
        ${CURATED_TEMPLATES.map((tpl) => {
          let art = Illustrations.phone;
          if (tpl.formFactor === 'large_phone') art = Illustrations.largePhone;
          if (tpl.formFactor === 'tablet') art = Illustrations.tablet;
          if (tpl.formFactor === 'foldable') art = Illustrations.foldable;

          return `
            <div class="template-card">
              <div class="card-device-preview" style="height: 100px; margin-bottom: 14px;">
                ${art}
              </div>
              <h3 class="template-title">${tpl.title}</h3>
              <div class="template-subtitle">${tpl.subtitle}</div>

              <ul class="template-feature-list">
                ${tpl.features.map((f) => `<li>${f}</li>`).join('')}
              </ul>

              <button class="btn-create-primary btn-use-template" data-template-id="${tpl.id}" style="margin-top: auto; justify-content: center;">
                <span>Use Template</span>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.element.querySelectorAll('.btn-use-template').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-template-id');
        const tpl = CURATED_TEMPLATES.find((t) => t.id === id);
        if (tpl) {
          this.callbacks.onUseTemplate(tpl.preset);
        }
      });
    });
  }
}
