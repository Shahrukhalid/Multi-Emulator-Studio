import {
  AudioSample,
  AudioState,
  BatteryState,
  BiometricAction,
  CameraFacing,
  CameraPattern,
  CameraPatternInfo,
  CrawlConfig,
  CrawlStrategy,
  DeepLinkRequest,
  DeviceSensorState,
  DevToolsTarget,
  IntentRequest,
  NotificationSimulationRequest,
  PerformanceSample,
  RoboCrawlReport,
  SensorUpdate,
  Snapshot
} from '../types.js';
import { toast } from '../toast.js';

function esc(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function mountModal(title: string, wide = false, onClose?: () => void): {
  backdrop: HTMLDivElement;
  win: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  close: () => void;
} {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.tabIndex = -1;

  const win = document.createElement('div');
  win.className = `modal-window tool-modal${wide ? ' tool-modal-wide' : ''}`;
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-modal', 'true');
  win.innerHTML = `
    <div class="modal-title-bar">
      <h2 class="modal-heading">${esc(title)}</h2>
      <button type="button" class="btn-overflow-menu tool-modal-close" aria-label="Close">×</button>
    </div>
    <div class="modal-content tool-modal-body"></div>
    <div class="modal-actions tool-modal-footer"></div>
  `;

  const body = win.querySelector('.tool-modal-body') as HTMLDivElement;
  const footer = win.querySelector('.tool-modal-footer') as HTMLDivElement;
  const closeBtn = win.querySelector('.tool-modal-close') as HTMLButtonElement;

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  let closed = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = prevOverflow;
    backdrop.remove();
    onClose?.();
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  window.addEventListener('keydown', onKeyDown);

  backdrop.appendChild(win);
  document.body.appendChild(backdrop);

  return {
    backdrop,
    win,
    body,
    footer,
    close
  };
}

export function openConfirmModal(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const modal = mountModal(opts.title, false, () => settle(false));

    modal.body.innerHTML = `<p class="tool-modal-lead">${esc(opts.message)}</p>`;
    modal.footer.innerHTML = `
      <button type="button" class="btn-secondary-action" id="tm-cancel">${esc(opts.cancelLabel || 'Cancel')}</button>
      <button type="button" class="${opts.danger ? 'btn-danger-outline' : 'btn-create-primary'}" id="tm-confirm">${esc(opts.confirmLabel || 'Continue')}</button>
    `;

    modal.footer.querySelector('#tm-cancel')?.addEventListener('click', () => {
      settle(false);
      modal.close();
    });
    const confirmBtn = modal.footer.querySelector('#tm-confirm') as HTMLButtonElement;
    confirmBtn?.addEventListener('click', () => {
      settle(true);
      modal.close();
    });
    confirmBtn?.focus();
  });
}

export function openTextPromptModal(opts: {
  title: string;
  description?: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  submitLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (val: string | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const modal = mountModal(opts.title, false, () => settle(null));

    modal.body.innerHTML = `
      ${opts.description ? `<p class="tool-modal-lead">${esc(opts.description)}</p>` : ''}
      <label class="form-label" for="tm-prompt-input">${esc(opts.label)}</label>
      <input type="text" class="form-text-input" id="tm-prompt-input" value="${esc(opts.defaultValue || '')}" placeholder="${esc(opts.placeholder || '')}" />
    `;
    modal.footer.innerHTML = `
      <button type="button" class="btn-secondary-action" id="tm-cancel">Cancel</button>
      <button type="button" class="btn-create-primary" id="tm-submit">${esc(opts.submitLabel || 'Save')}</button>
    `;

    const input = modal.body.querySelector('#tm-prompt-input') as HTMLInputElement;
    modal.footer.querySelector('#tm-cancel')?.addEventListener('click', () => {
      settle(null);
      modal.close();
    });
    modal.footer.querySelector('#tm-submit')?.addEventListener('click', () => {
      settle(input.value);
      modal.close();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        settle(input.value);
        modal.close();
      }
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
  });
}

export function openSelectModal<T>(opts: {
  title: string;
  description?: string;
  items: T[];
  getTitle: (item: T) => string;
  getMeta?: (item: T) => string;
  submitLabel?: string;
  emptyMessage?: string;
}): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    let selectedIndex = 0;
    const settle = (item: T | null) => {
      if (settled) return;
      settled = true;
      resolve(item);
    };
    const modal = mountModal(opts.title, false, () => settle(null));

    if (opts.items.length === 0) {
      modal.body.innerHTML = `<p class="tool-modal-lead">${esc(opts.emptyMessage || 'No items available.')}</p>`;
      modal.footer.innerHTML = `<button type="button" class="btn-secondary-action" id="tm-close">Close</button>`;
      modal.footer.querySelector('#tm-close')?.addEventListener('click', () => {
        settle(null);
        modal.close();
      });
      return;
    }

    modal.body.innerHTML = `
      ${opts.description ? `<p class="tool-modal-lead">${esc(opts.description)}</p>` : ''}
      <div class="tool-list" role="listbox">
        ${opts.items
          .map(
            (item, idx) => `
          <button type="button" class="tool-list-item ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
            <div class="tool-list-main">
              <strong>${esc(opts.getTitle(item))}</strong>
              ${opts.getMeta ? `<span class="tool-list-meta">${esc(opts.getMeta(item))}</span>` : ''}
            </div>
            <span class="badge-subtle">#${idx + 1}</span>
          </button>
        `
          )
          .join('')}
      </div>
    `;

    modal.footer.innerHTML = `
      <button type="button" class="btn-secondary-action" id="tm-cancel">Cancel</button>
      <button type="button" class="btn-create-primary" id="tm-run">${esc(opts.submitLabel || 'Confirm')}</button>
    `;

    const rowEls = Array.from(modal.body.querySelectorAll<HTMLButtonElement>('.tool-list-item'));
    rowEls.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedIndex = parseInt(btn.dataset.idx || '0', 10);
        rowEls.forEach((r) => r.classList.remove('selected'));
        btn.classList.add('selected');
      });
      btn.addEventListener('dblclick', () => {
        selectedIndex = parseInt(btn.dataset.idx || '0', 10);
        settle(opts.items[selectedIndex] ?? null);
        modal.close();
      });
    });

    modal.footer.querySelector('#tm-cancel')?.addEventListener('click', () => {
      settle(null);
      modal.close();
    });
    modal.footer.querySelector('#tm-run')?.addEventListener('click', () => {
      settle(opts.items[selectedIndex] ?? null);
      modal.close();
    });
  });
}

export function openClipboardModal(opts: {
  deviceName: string;
  initialText: string;
  onPushToDevice: (text: string) => Promise<void>;
}): void {
  const modal = mountModal(`Clipboard Sync · ${opts.deviceName}`);
  modal.body.innerHTML = `
    <p class="tool-modal-lead">Inspect the current virtual device clipboard or push text directly into it.</p>
    <label class="form-label" for="tm-clip-text">Clipboard Text</label>
    <textarea class="form-text-input tool-textarea" id="tm-clip-text" rows="5" placeholder="Enter text to send to device...">${esc(opts.initialText)}</textarea>
  `;
  modal.footer.innerHTML = `
    <button type="button" class="btn-secondary-action" id="tm-copy-host">Copy to Host</button>
    <button type="button" class="btn-secondary-action" id="tm-close">Close</button>
    <button type="button" class="btn-create-primary" id="tm-push-device">Push to Device</button>
  `;

  const textarea = modal.body.querySelector('#tm-clip-text') as HTMLTextAreaElement;
  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
  modal.footer.querySelector('#tm-copy-host')?.addEventListener('click', async () => {
    if (!textarea.value) {
      toast.show('Clipboard text box is empty.', 'warning');
      return;
    }
    try {
      await navigator.clipboard?.writeText(textarea.value);
      toast.show('Copied text to host clipboard.', 'success');
    } catch {
      toast.show('Could not access host clipboard.', 'error');
    }
  });
  modal.footer.querySelector('#tm-push-device')?.addEventListener('click', async () => {
    try {
      await opts.onPushToDevice(textarea.value);
      toast.show('Pushed text to device clipboard.', 'success');
      modal.close();
    } catch (err: unknown) {
      toast.show(`Failed to set clipboard: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  });
}

export function openAudioStudioModal(opts: {
  deviceName: string;
  initialState: AudioState;
  samples: AudioSample[];
  onSetAudioState: (volume: number, muted: boolean) => Promise<void>;
  onInjectSample: (sampleId: string) => Promise<void>;
}): void {
  const modal = mountModal(`Audio & Sound Studio · ${opts.deviceName}`, true);
  let volume = opts.initialState.output_volume;
  let muted = opts.initialState.muted;

  modal.body.innerHTML = `
    <div class="tool-card-section">
      <div class="tool-section-row">
        <div>
          <strong>Output Stream Gain</strong>
          <div class="tool-list-meta" id="tm-audio-status">${volume}% · ${muted ? 'Muted' : 'Active'}</div>
        </div>
        <button type="button" class="btn-secondary-action" id="tm-audio-mute">${muted ? 'Unmute' : 'Mute'}</button>
      </div>
      <div class="tool-slider-row">
        <input type="range" min="0" max="100" value="${volume}" id="tm-audio-range" aria-label="Device volume" />
        <button type="button" class="btn-create-primary" id="tm-audio-apply">Apply Volume</button>
      </div>
    </div>

    <div class="tool-card-section">
      <h4 class="tool-section-heading">Synthesized Test Sound Injection</h4>
      <div class="tool-list">
        ${opts.samples
          .map(
            (s) => `
          <div class="tool-list-item static">
            <div class="tool-list-main">
              <strong>${esc(s.title)}</strong>
              <span class="tool-list-meta">${esc(s.category.toUpperCase())} · ${s.duration_ms}ms · ${esc(s.description)}</span>
            </div>
            <button type="button" class="btn-secondary-action tm-inject-sample" data-sample-id="${esc(s.id)}">Inject</button>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
  modal.footer.innerHTML = `<button type="button" class="btn-secondary-action" id="tm-close">Close</button>`;

  const range = modal.body.querySelector('#tm-audio-range') as HTMLInputElement;
  const statusEl = modal.body.querySelector('#tm-audio-status') as HTMLElement;
  const muteBtn = modal.body.querySelector('#tm-audio-mute') as HTMLButtonElement;

  const refreshLabel = () => {
    statusEl.textContent = `${volume}% · ${muted ? 'Muted' : 'Active'}`;
    muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  };

  range?.addEventListener('input', () => {
    volume = parseInt(range.value, 10) || 0;
    refreshLabel();
  });

  muteBtn?.addEventListener('click', async () => {
    muted = !muted;
    refreshLabel();
    try {
      await opts.onSetAudioState(volume, muted);
      toast.show(`Device audio ${muted ? 'muted' : 'unmuted'}.`, 'success');
    } catch (err: unknown) {
      toast.show(`Audio error: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  });

  modal.body.querySelector('#tm-audio-apply')?.addEventListener('click', async () => {
    try {
      await opts.onSetAudioState(volume, false);
      muted = false;
      refreshLabel();
      toast.show(`Device volume set to ${volume}%.`, 'success');
    } catch (err: unknown) {
      toast.show(`Audio error: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  });

  modal.body.querySelectorAll<HTMLButtonElement>('.tm-inject-sample').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.sampleId || '';
      btn.disabled = true;
      try {
        await opts.onInjectSample(sid);
        toast.show(`Injected audio sample "${sid}" successfully.`, 'success');
      } catch (err: unknown) {
        toast.show(`Audio injection failed: ${(err as { message?: string }).message || String(err)}`, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
}

export function openSensorsHubModal(opts: {
  deviceName: string;
  initialState: DeviceSensorState;
  onBiometric: (action: BiometricAction) => Promise<void>;
  onBattery: (state: BatteryState) => Promise<void>;
  onSensor: (update: SensorUpdate) => Promise<void>;
}): void {
  const modal = mountModal(`Sensors & Biometrics Hub · ${opts.deviceName}`, true);
  let capacity = opts.initialState.battery.capacity_percent;
  let charging = opts.initialState.battery.ac_plugged;

  modal.body.innerHTML = `
    <div class="tool-kpi-grid">
      <div class="tool-card-section">
        <h4 class="tool-section-heading">Biometrics Simulation</h4>
        <div class="tool-action-row">
          <button type="button" class="btn-create-primary" id="tm-bio-match">Fingerprint Match</button>
          <button type="button" class="btn-danger-outline" id="tm-bio-unmatch">Fingerprint Reject</button>
          <button type="button" class="btn-secondary-action" id="tm-bio-enroll">Enroll ID #1</button>
        </div>
      </div>

      <div class="tool-card-section">
        <h4 class="tool-section-heading">Battery & Power State</h4>
        <div class="tool-slider-row">
          <label class="tool-list-meta" for="tm-batt-range">Level: <strong id="tm-batt-val">${capacity}%</strong></label>
          <input type="range" min="0" max="100" value="${capacity}" id="tm-batt-range" />
        </div>
        <label class="checkbox-label">
          <input type="checkbox" id="tm-batt-ac" ${charging ? 'checked' : ''} />
          <span>AC Power Connected (Charging)</span>
        </label>
        <div class="tool-action-row" style="margin-top: 10px;">
          <button type="button" class="btn-secondary-action" id="tm-batt-low">Preset: 15% Low</button>
          <button type="button" class="btn-secondary-action" id="tm-batt-full">Preset: 100% Full</button>
          <button type="button" class="btn-create-primary" id="tm-batt-apply">Apply Battery</button>
        </div>
      </div>
    </div>

    <div class="tool-card-section">
      <h4 class="tool-section-heading">Hardware Orientation & Environment Sensors</h4>
      <div class="tool-action-row">
        <button type="button" class="btn-secondary-action" id="tm-tilt-flat">Flat Table (0°)</button>
        <button type="button" class="btn-secondary-action" id="tm-tilt-portrait">Portrait Tilt (45°)</button>
        <button type="button" class="btn-secondary-action" id="tm-tilt-landscape">Landscape Roll (45°)</button>
        <button type="button" class="btn-secondary-action" id="tm-prox-near">Proximity: Near (0.5cm)</button>
        <button type="button" class="btn-secondary-action" id="tm-prox-far">Proximity: Far (5.0cm)</button>
        <button type="button" class="btn-secondary-action" id="tm-light-dark">Ambient Light: Dark (10 lx)</button>
      </div>
    </div>
  `;
  modal.footer.innerHTML = `<button type="button" class="btn-secondary-action" id="tm-close">Close</button>`;

  const battRange = modal.body.querySelector('#tm-batt-range') as HTMLInputElement;
  const battVal = modal.body.querySelector('#tm-batt-val') as HTMLElement;
  const battAc = modal.body.querySelector('#tm-batt-ac') as HTMLInputElement;

  battRange?.addEventListener('input', () => {
    capacity = parseInt(battRange.value, 10) || 0;
    battVal.textContent = `${capacity}%`;
  });
  battAc?.addEventListener('change', () => {
    charging = battAc.checked;
  });

  const runAction = async (fn: () => Promise<void>, okMsg: string) => {
    try {
      await fn();
      toast.show(okMsg, 'success');
    } catch (err: unknown) {
      toast.show(`Sensor error: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  };

  modal.body.querySelector('#tm-bio-match')?.addEventListener('click', () => void runAction(() => opts.onBiometric({ type: 'match', finger_id: 1 }), 'Fingerprint match sent.'));
  modal.body.querySelector('#tm-bio-unmatch')?.addEventListener('click', () => void runAction(() => opts.onBiometric({ type: 'unmatch' }), 'Fingerprint reject sent.'));
  modal.body.querySelector('#tm-bio-enroll')?.addEventListener('click', () => void runAction(() => opts.onBiometric({ type: 'enroll', finger_id: 1 }), 'Enrolled fingerprint ID #1.'));

  const pushBattery = (cap: number, ac: boolean) => {
    capacity = cap;
    charging = ac;
    battRange.value = String(cap);
    battVal.textContent = `${cap}%`;
    battAc.checked = ac;
    void runAction(
      () =>
        opts.onBattery({
          capacity_percent: cap,
          ac_plugged: ac,
          status: ac ? 'Charging' : 'Discharging',
          health: 'Good'
        }),
      `Battery set to ${cap}% (${ac ? 'Charging' : 'Discharging'}).`
    );
  };

  modal.body.querySelector('#tm-batt-low')?.addEventListener('click', () => pushBattery(15, false));
  modal.body.querySelector('#tm-batt-full')?.addEventListener('click', () => pushBattery(100, true));
  modal.body.querySelector('#tm-batt-apply')?.addEventListener('click', () => pushBattery(capacity, charging));

  modal.body.querySelector('#tm-tilt-flat')?.addEventListener('click', () => void runAction(() => opts.onSensor({ type: 'acceleration', x: 0, y: 9.81, z: 0 }), 'Applied 0° flat orientation.'));
  modal.body.querySelector('#tm-tilt-portrait')?.addEventListener('click', () => void runAction(() => opts.onSensor({ type: 'acceleration', x: 0, y: 6.94, z: 6.94 }), 'Applied 45° portrait tilt.'));
  modal.body.querySelector('#tm-tilt-landscape')?.addEventListener('click', () => void runAction(() => opts.onSensor({ type: 'acceleration', x: 6.94, y: 6.94, z: 0 }), 'Applied 45° landscape roll.'));
  modal.body.querySelector('#tm-prox-near')?.addEventListener('click', () => void runAction(() => opts.onSensor({ type: 'proximity', distance_cm: 0.5 }), 'Set proximity to Near (0.5cm).'));
  modal.body.querySelector('#tm-prox-far')?.addEventListener('click', () => void runAction(() => opts.onSensor({ type: 'proximity', distance_cm: 5.0 }), 'Set proximity to Far (5.0cm).'));
  modal.body.querySelector('#tm-light-dark')?.addEventListener('click', () => void runAction(() => opts.onSensor({ type: 'light', lux: 10 }), 'Set ambient light to 10 lux.'));

  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
}

export function openRoboCrawlModal(opts: {
  deviceName: string;
  onRun: (config: CrawlConfig) => Promise<RoboCrawlReport>;
}): void {
  const modal = mountModal(`Autonomous Robo UI Crawler · ${opts.deviceName}`, true);
  modal.body.innerHTML = `
    <div class="tool-form-grid">
      <div class="form-field">
        <label class="form-label" for="tm-crawl-pkg">Target Package Name</label>
        <input type="text" class="form-text-input" id="tm-crawl-pkg" value="com.android.settings" />
      </div>
      <div class="form-field">
        <label class="form-label" for="tm-crawl-strategy">Traversal Strategy</label>
        <select class="form-select-input" id="tm-crawl-strategy">
          <option value="breadth_first" selected>Breadth-First</option>
          <option value="depth_first">Depth-First</option>
          <option value="random_walk">Random Walk</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label" for="tm-crawl-actions">Max Actions</label>
        <input type="number" class="form-text-input" id="tm-crawl-actions" min="1" max="100" value="20" />
      </div>
      <div class="form-field" style="justify-content: flex-end;">
        <label class="checkbox-label">
          <input type="checkbox" id="tm-crawl-inputs" checked />
          <span>Explore text input fields</span>
        </label>
      </div>
    </div>
    <div class="tool-card-section" id="tm-crawl-result" hidden></div>
  `;
  modal.footer.innerHTML = `
    <button type="button" class="btn-secondary-action" id="tm-close">Close</button>
    <button type="button" class="btn-create-primary" id="tm-crawl-start">Launch Robo Crawl</button>
  `;

  const pkgInput = modal.body.querySelector('#tm-crawl-pkg') as HTMLInputElement;
  const strategySel = modal.body.querySelector('#tm-crawl-strategy') as HTMLSelectElement;
  const maxInput = modal.body.querySelector('#tm-crawl-actions') as HTMLInputElement;
  const inputsChk = modal.body.querySelector('#tm-crawl-inputs') as HTMLInputElement;
  const resultEl = modal.body.querySelector('#tm-crawl-result') as HTMLElement;
  const startBtn = modal.footer.querySelector('#tm-crawl-start') as HTMLButtonElement;

  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
  startBtn?.addEventListener('click', async () => {
    const pkg = pkgInput.value.trim();
    if (!pkg) {
      toast.show('Target package name is required.', 'warning');
      return;
    }
    startBtn.disabled = true;
    startBtn.textContent = 'Crawling UI…';
    try {
      const report = await opts.onRun({
        package_name: pkg,
        max_depth: 5,
        max_actions: Math.max(1, Math.min(100, parseInt(maxInput.value, 10) || 20)),
        strategy: strategySel.value as CrawlStrategy,
        throttle_ms: 300,
        explore_inputs: inputsChk.checked
      });
      resultEl.hidden = false;
      resultEl.innerHTML = `
        <h4 class="tool-section-heading">Crawl Summary (${esc(report.status)})</h4>
        <div class="tool-list-meta">Screens: <strong>${report.screens_discovered}</strong> · Actions: <strong>${report.actions_performed}</strong> · Duration: <strong>${report.duration_ms}ms</strong> · Crashes: <strong>${report.crashes.length}</strong></div>
      `;
      toast.show(
        `Robo Crawl finished: ${report.screens_discovered} screens, ${report.actions_performed} actions.`,
        report.crashes.length > 0 ? 'error' : 'success'
      );
    } catch (err: unknown) {
      toast.show(`Robo Crawl error: ${(err as { message?: string }).message || String(err)}`, 'error');
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = 'Launch Robo Crawl';
    }
  });
}

export function openCameraModal(opts: {
  deviceName: string;
  patterns: CameraPatternInfo[];
  onInject: (pattern: CameraPattern, facing: CameraFacing, payload?: string) => Promise<void>;
}): void {
  const modal = mountModal(`Camera & QR Pattern Injector · ${opts.deviceName}`, true);
  let selected = opts.patterns[1] || opts.patterns[0];

  modal.body.innerHTML = `
    <div class="tool-list">
      ${opts.patterns
        .map(
          (p) => `
        <button type="button" class="tool-list-item ${p.id === selected?.id ? 'selected' : ''}" data-pid="${esc(p.id)}">
          <div class="tool-list-main">
            <strong>${esc(p.title)}</strong>
            <span class="tool-list-meta">${esc(p.description)}</span>
          </div>
          <span class="badge-subtle">${esc(p.pattern)}</span>
        </button>
      `
        )
        .join('')}
    </div>
    <div class="tool-form-grid">
      <div class="form-field">
        <label class="form-label" for="tm-cam-facing">Camera Lens</label>
        <select class="form-select-input" id="tm-cam-facing">
          <option value="back" selected>Rear Camera</option>
          <option value="front">Front Selfie Camera</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label" for="tm-cam-payload">Pattern / QR Payload</label>
        <input type="text" class="form-text-input" id="tm-cam-payload" value="${esc(selected?.default_payload || '')}" />
      </div>
    </div>
  `;
  modal.footer.innerHTML = `
    <button type="button" class="btn-secondary-action" id="tm-close">Close</button>
    <button type="button" class="btn-create-primary" id="tm-cam-inject">Inject Pattern</button>
  `;

  const payloadInput = modal.body.querySelector('#tm-cam-payload') as HTMLInputElement;
  const facingSel = modal.body.querySelector('#tm-cam-facing') as HTMLSelectElement;
  const injectBtn = modal.footer.querySelector('#tm-cam-inject') as HTMLButtonElement;
  const rows = Array.from(modal.body.querySelectorAll<HTMLButtonElement>('.tool-list-item'));

  rows.forEach((row) => {
    row.addEventListener('click', () => {
      const next = opts.patterns.find((p) => p.id === row.dataset.pid);
      if (!next) return;
      selected = next;
      rows.forEach((r) => r.classList.remove('selected'));
      row.classList.add('selected');
      payloadInput.value = next.default_payload;
    });
  });

  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
  injectBtn?.addEventListener('click', async () => {
    if (!selected) return;
    injectBtn.disabled = true;
    try {
      await opts.onInject(selected.pattern, facingSel.value as CameraFacing, payloadInput.value.trim() || undefined);
      toast.show(`Injected "${selected.title}" into device camera feed.`, 'success');
      modal.close();
    } catch (err: unknown) {
      toast.show(`Camera injection failed: ${(err as { message?: string }).message || String(err)}`, 'error');
    } finally {
      injectBtn.disabled = false;
    }
  });
}

export async function openSnapshotModal(opts: {
  deviceName: string;
  loadSnapshots: () => Promise<Snapshot[]>;
  onSave: (name: string, description?: string) => Promise<Snapshot>;
  onRestore: (name: string) => Promise<void>;
  onDelete: (snapshotId: string, name: string) => Promise<void>;
}): Promise<void> {
  const modal = mountModal(`State Checkpoints & Snapshots · ${opts.deviceName}`, true);
  modal.body.innerHTML = `
    <div class="tool-card-section">
      <h4 class="tool-section-heading">Save New Checkpoint</h4>
      <div class="tool-form-grid">
        <div class="form-field">
          <label class="form-label" for="tm-snap-name">Checkpoint Name</label>
          <input type="text" class="form-text-input" id="tm-snap-name" value="checkpoint_${Date.now()}" />
        </div>
        <div class="form-field">
          <label class="form-label" for="tm-snap-desc">Description</label>
          <input type="text" class="form-text-input" id="tm-snap-desc" value="Saved from Studio" />
        </div>
      </div>
      <div class="tool-action-row" style="margin-top: 8px;">
        <button type="button" class="btn-create-primary" id="tm-snap-save">Save Checkpoint</button>
      </div>
    </div>
    <div class="tool-card-section">
      <h4 class="tool-section-heading">Saved Checkpoints</h4>
      <div class="tool-list" id="tm-snap-list">
        <div class="tool-list-meta">Loading checkpoints…</div>
      </div>
    </div>
  `;
  modal.footer.innerHTML = `<button type="button" class="btn-secondary-action" id="tm-close">Close</button>`;

  const nameInput = modal.body.querySelector('#tm-snap-name') as HTMLInputElement;
  const descInput = modal.body.querySelector('#tm-snap-desc') as HTMLInputElement;
  const listEl = modal.body.querySelector('#tm-snap-list') as HTMLElement;
  const saveBtn = modal.body.querySelector('#tm-snap-save') as HTMLButtonElement;

  const renderList = async () => {
    try {
      const snaps = await opts.loadSnapshots();
      if (snaps.length === 0) {
        listEl.innerHTML = `<div class="tool-list-meta">No checkpoints saved for this device yet.</div>`;
        return;
      }
      listEl.innerHTML = snaps
        .map(
          (s) => `
        <div class="tool-list-item static">
          <div class="tool-list-main">
            <strong>${esc(s.name)}</strong>
            <span class="tool-list-meta">${esc(s.description || 'No description')} · ${esc(s.created_at)}</span>
          </div>
          <div class="tool-action-row">
            <button type="button" class="btn-secondary-action tm-snap-restore" data-name="${esc(s.name)}">Restore</button>
            <button type="button" class="btn-danger-outline tm-snap-del" data-id="${esc(s.id)}" data-name="${esc(s.name)}">Delete</button>
          </div>
        </div>
      `
        )
        .join('');

      listEl.querySelectorAll<HTMLButtonElement>('.tm-snap-restore').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name || '';
          btn.disabled = true;
          try {
            await opts.onRestore(name);
            toast.show(`Restored checkpoint "${name}".`, 'success');
          } catch (err: unknown) {
            toast.show(`Restore error: ${(err as { message?: string }).message || String(err)}`, 'error');
          } finally {
            btn.disabled = false;
          }
        });
      });

      listEl.querySelectorAll<HTMLButtonElement>('.tm-snap-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id || '';
          const name = btn.dataset.name || '';
          btn.disabled = true;
          try {
            await opts.onDelete(id, name);
            toast.show(`Deleted checkpoint "${name}".`, 'info');
            await renderList();
          } catch (err: unknown) {
            toast.show(`Delete error: ${(err as { message?: string }).message || String(err)}`, 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err: unknown) {
      listEl.innerHTML = `<div class="tool-list-meta">Failed to load checkpoints: ${esc((err as { message?: string }).message || String(err))}</div>`;
    }
  };

  saveBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      toast.show('Checkpoint name is required.', 'warning');
      return;
    }
    saveBtn.disabled = true;
    try {
      const snap = await opts.onSave(name, descInput.value.trim() || undefined);
      toast.show(`Saved checkpoint "${snap.name}".`, 'success');
      nameInput.value = `checkpoint_${Date.now()}`;
      await renderList();
    } catch (err: unknown) {
      toast.show(`Save error: ${(err as { message?: string }).message || String(err)}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
  await renderList();
}

export async function openProfilerModal(opts: {
  deviceName: string;
  fetchSample: () => Promise<PerformanceSample>;
  exportCsv: () => Promise<string>;
}): Promise<void> {
  const modal = mountModal(`Live Performance Profiler · ${opts.deviceName}`, true);
  modal.body.innerHTML = `<div class="tool-kpi-grid" id="tm-prof-grid"><div class="tool-list-meta">Sampling live metrics…</div></div>`;
  modal.footer.innerHTML = `
    <button type="button" class="btn-secondary-action" id="tm-prof-refresh">Refresh Sample</button>
    <button type="button" class="btn-secondary-action" id="tm-prof-csv">Export CSV</button>
    <button type="button" class="btn-create-primary" id="tm-close">Close</button>
  `;

  const grid = modal.body.querySelector('#tm-prof-grid') as HTMLElement;

  const loadSample = async () => {
    try {
      const s = await opts.fetchSample();
      const ramPct = s.ram_total_mb > 0 ? Math.min(100, Math.round((s.ram_used_mb / s.ram_total_mb) * 100)) : 0;
      grid.innerHTML = `
        <div class="tool-kpi-card">
          <span class="tool-list-meta">CPU Utilization</span>
          <strong class="tool-kpi-value">${s.cpu_percent.toFixed(1)}%</strong>
        </div>
        <div class="tool-kpi-card">
          <span class="tool-list-meta">Memory (${ramPct}%)</span>
          <strong class="tool-kpi-value">${s.ram_used_mb} / ${s.ram_total_mb} MB</strong>
          <span class="tool-list-meta">Dalvik ${s.ram_dalvik_mb}MB · Native ${s.ram_native_mb}MB · Gfx ${s.ram_graphics_mb}MB</span>
        </div>
        <div class="tool-kpi-card">
          <span class="tool-list-meta">Frame Rate / Jank</span>
          <strong class="tool-kpi-value">${s.fps.toFixed(1)} FPS</strong>
          <span class="tool-list-meta">${s.jank_frames} jank frames</span>
        </div>
        <div class="tool-kpi-card">
          <span class="tool-list-meta">Battery Thermal</span>
          <strong class="tool-kpi-value">${s.battery_temp_c.toFixed(1)} °C</strong>
        </div>
      `;
    } catch (err: unknown) {
      grid.innerHTML = `<div class="tool-list-meta">Profiler sample error: ${esc((err as { message?: string }).message || String(err))}</div>`;
    }
  };

  modal.footer.querySelector('#tm-prof-refresh')?.addEventListener('click', () => void loadSample());
  modal.footer.querySelector('#tm-prof-csv')?.addEventListener('click', async () => {
    try {
      const csv = await opts.exportCsv();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mes-profiler-${opts.deviceName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.show('Performance telemetry CSV exported.', 'success');
    } catch (err: unknown) {
      toast.show(`CSV export error: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  });
  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
  await loadSample();
}

export function openIntentStudioModal(opts: {
  deviceId: string;
  deviceName: string;
  onDeepLink: (req: DeepLinkRequest) => Promise<string>;
  onIntent: (req: IntentRequest) => Promise<string>;
  onNotification: (req: NotificationSimulationRequest) => Promise<string>;
}): void {
  const modal = mountModal(`Intent & Deep Link Studio · ${opts.deviceName}`, true);
  let activeTab: 'deeplink' | 'intent' | 'notif' = 'deeplink';

  modal.body.innerHTML = `
    <div class="tool-tab-bar">
      <button type="button" class="tool-tab-btn active" data-tab="deeplink">Deep Link</button>
      <button type="button" class="tool-tab-btn" data-tab="intent">Custom Intent</button>
      <button type="button" class="tool-tab-btn" data-tab="notif">Push Notification</button>
    </div>

    <div class="tool-card-section" id="tm-panel-deeplink">
      <div class="tool-form-grid">
        <div class="form-field">
          <label class="form-label" for="tm-dl-uri">URI Scheme / App Link</label>
          <input type="text" class="form-text-input" id="tm-dl-uri" value="myapp://home?tab=dashboard" />
        </div>
        <div class="form-field">
          <label class="form-label" for="tm-dl-pkg">Target Package (Optional)</label>
          <input type="text" class="form-text-input" id="tm-dl-pkg" placeholder="com.example.app" />
        </div>
      </div>
    </div>

    <div class="tool-card-section" id="tm-panel-intent" hidden>
      <div class="tool-form-grid">
        <div class="form-field">
          <label class="form-label" for="tm-int-action">Intent Action</label>
          <input type="text" class="form-text-input" id="tm-int-action" value="android.intent.action.VIEW" />
        </div>
        <div class="form-field">
          <label class="form-label" for="tm-int-data">Data URI (Optional)</label>
          <input type="text" class="form-text-input" id="tm-int-data" value="https://example.com" />
        </div>
        <div class="form-field">
          <label class="form-label" for="tm-int-key">Extra Key (Optional)</label>
          <input type="text" class="form-text-input" id="tm-int-key" value="auth_token" />
        </div>
        <div class="form-field">
          <label class="form-label" for="tm-int-val">Extra Value</label>
          <input type="text" class="form-text-input" id="tm-int-val" value="test_token_2026" />
        </div>
      </div>
    </div>

    <div class="tool-card-section" id="tm-panel-notif" hidden>
      <div class="tool-form-grid">
        <div class="form-field">
          <label class="form-label" for="tm-not-title">Notification Title</label>
          <input type="text" class="form-text-input" id="tm-not-title" value="Order Update" />
        </div>
        <div class="form-field">
          <label class="form-label" for="tm-not-body">Message Body</label>
          <input type="text" class="form-text-input" id="tm-not-body" value="Your test package has arrived." />
        </div>
      </div>
    </div>
  `;
  modal.footer.innerHTML = `
    <button type="button" class="btn-secondary-action" id="tm-close">Close</button>
    <button type="button" class="btn-create-primary" id="tm-dispatch">Dispatch</button>
  `;

  const panels = {
    deeplink: modal.body.querySelector('#tm-panel-deeplink') as HTMLElement,
    intent: modal.body.querySelector('#tm-panel-intent') as HTMLElement,
    notif: modal.body.querySelector('#tm-panel-notif') as HTMLElement
  };
  const tabs = Array.from(modal.body.querySelectorAll<HTMLButtonElement>('.tool-tab-btn'));

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab as 'deeplink' | 'intent' | 'notif';
      tabs.forEach((t) => t.classList.toggle('active', t === btn));
      panels.deeplink.hidden = activeTab !== 'deeplink';
      panels.intent.hidden = activeTab !== 'intent';
      panels.notif.hidden = activeTab !== 'notif';
    });
  });

  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
  modal.footer.querySelector('#tm-dispatch')?.addEventListener('click', async () => {
    try {
      if (activeTab === 'deeplink') {
        const uri = (modal.body.querySelector('#tm-dl-uri') as HTMLInputElement).value.trim();
        const pkg = (modal.body.querySelector('#tm-dl-pkg') as HTMLInputElement).value.trim();
        if (!uri) return toast.show('Deep link URI is required.', 'warning');
        await opts.onDeepLink({ device_id: opts.deviceId, uri, package: pkg || undefined });
        toast.show(`Dispatched deep link: ${uri}`, 'success');
      } else if (activeTab === 'intent') {
        const action = (modal.body.querySelector('#tm-int-action') as HTMLInputElement).value.trim();
        const dataUri = (modal.body.querySelector('#tm-int-data') as HTMLInputElement).value.trim();
        const key = (modal.body.querySelector('#tm-int-key') as HTMLInputElement).value.trim();
        const val = (modal.body.querySelector('#tm-int-val') as HTMLInputElement).value;
        if (!action) return toast.show('Intent action is required.', 'warning');
        const extras = key ? [{ key, value_type: 'string' as const, value: val }] : [];
        await opts.onIntent({ device_id: opts.deviceId, action, data_uri: dataUri || undefined, extras });
        toast.show(`Dispatched intent: ${action}`, 'success');
      } else {
        const title = (modal.body.querySelector('#tm-not-title') as HTMLInputElement).value.trim();
        const body = (modal.body.querySelector('#tm-not-body') as HTMLInputElement).value.trim();
        if (!title || !body) return toast.show('Title and body are required.', 'warning');
        await opts.onNotification({
          device_id: opts.deviceId,
          title,
          body,
          channel_id: 'marketing_alerts',
          tag: 'mes_simulated_alert'
        });
        toast.show(`Simulated notification "${title}".`, 'success');
      }
      modal.close();
    } catch (err: unknown) {
      toast.show(`Dispatch failed: ${(err as { message?: string }).message || String(err)}`, 'error');
    }
  });
}

export async function openDevToolsModal(opts: {
  deviceName: string;
  port: number;
  fetchTargets: () => Promise<DevToolsTarget[]>;
}): Promise<void> {
  const modal = mountModal(`Remote WebView DevTools · ${opts.deviceName}`, true);
  modal.body.innerHTML = `
    <p class="tool-modal-lead">Forwarded TCP Bridge: <code>127.0.0.1:${opts.port}</code></p>
    <div class="tool-list" id="tm-dt-list"><div class="tool-list-meta">Discovering WebView inspection targets…</div></div>
  `;
  modal.footer.innerHTML = `
    <button type="button" class="btn-secondary-action" id="tm-dt-chrome">Copy chrome://inspect URL</button>
    <button type="button" class="btn-secondary-action" id="tm-dt-refresh">Refresh</button>
    <button type="button" class="btn-create-primary" id="tm-close">Close</button>
  `;

  const listEl = modal.body.querySelector('#tm-dt-list') as HTMLElement;

  const load = async () => {
    try {
      const targets = await opts.fetchTargets();
      if (targets.length === 0) {
        listEl.innerHTML = `<div class="tool-list-meta">No inspectable WebViews detected on port ${opts.port}.</div>`;
        return;
      }
      listEl.innerHTML = targets
        .map(
          (t) => `
        <div class="tool-list-item static">
          <div class="tool-list-main">
            <strong>[${esc(t.type.toUpperCase())}] ${esc(t.title)}</strong>
            <span class="tool-list-meta">${esc(t.url)}</span>
          </div>
          <button type="button" class="btn-secondary-action tm-dt-copy" data-url="${esc(t.devtools_frontend_url)}">Copy URL</button>
        </div>
      `
        )
        .join('');

      listEl.querySelectorAll<HTMLButtonElement>('.tm-dt-copy').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const url = btn.dataset.url || '';
          try {
            await navigator.clipboard?.writeText(url);
            toast.show('Copied DevTools inspector URL to clipboard.', 'success');
          } catch {
            toast.show('Could not access clipboard.', 'error');
          }
        });
      });
    } catch (err: unknown) {
      listEl.innerHTML = `<div class="tool-list-meta">${esc((err as { message?: string }).message || String(err))}</div>`;
    }
  };

  modal.footer.querySelector('#tm-dt-chrome')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard?.writeText('chrome://inspect/#devices');
      toast.show('Copied chrome://inspect/#devices to clipboard.', 'success');
    } catch {
      toast.show('Could not access clipboard.', 'error');
    }
  });
  modal.footer.querySelector('#tm-dt-refresh')?.addEventListener('click', () => void load());
  modal.footer.querySelector('#tm-close')?.addEventListener('click', modal.close);
  await load();
}
