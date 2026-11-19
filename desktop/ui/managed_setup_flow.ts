import type { SetupStatus } from './types.js';

export interface ManagedSetupApi {
  onManagedStart: () => Promise<string>;
  onManagedStatus: () => Promise<SetupStatus>;
  onManagedAnswer: (yes: boolean) => Promise<void>;
  onManagedCancel: () => Promise<void>;
  onManagedConnect: (sdkRoot: string) => Promise<void>;
}

export type SetupPhase = 'idle' | 'preparing' | 'installing' | 'connecting' | 'ready' | 'failed' | 'cancelled';
export interface SetupView {
  phase: SetupPhase;
  message: string;
  output: string;
  awaitingAnswer: boolean;
  actionPending: boolean;
}

/** Keep the installer state independent of the lifetime of Settings' DOM nodes. */
export class ManagedSetupFlow {
  private view: SetupView = { phase: 'idle', message: '', output: '', awaitingAnswer: false, actionPending: false };
  private generation = 0;
  private actionVersion = 0;
  private pendingStatus: Promise<SetupStatus> | null = null;

  constructor(private api: ManagedSetupApi, private changed: () => void,
              private wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 1000))) {}

  get snapshot(): Readonly<SetupView> { return { ...this.view }; }
  get active(): boolean { return ['preparing', 'installing', 'connecting'].includes(this.view.phase); }

  private update(next: Partial<SetupView>): void { this.view = { ...this.view, ...next }; this.changed(); }

  async start(): Promise<void> {
    if (this.active) return;
    const generation = ++this.generation;
    this.update({ phase: 'preparing', message: 'Downloading and verifying official tools and private Java…', output: '', awaitingAnswer: false, actionPending: false });
    let sessionStarted = false;
    try {
      const root = await this.api.onManagedStart();
      sessionStarted = true;
      this.update({ phase: 'installing', message: 'Installing Android packages. Review each official license prompt.' });
      while (generation === this.generation) {
        const version = this.actionVersion;
        if (this.view.actionPending) { await this.wait(); continue; }
        this.pendingStatus = this.api.onManagedStatus();
        let status: SetupStatus;
        try { status = await this.pendingStatus; }
        finally { this.pendingStatus = null; }
        if (generation !== this.generation) return;
        if (status.done) {
          sessionStarted = false;
          this.update({ output: status.output, awaitingAnswer: false });
          if (!status.success) throw new Error('Official package setup did not finish. Review installer output and retry.');
          this.update({ phase: 'connecting', awaitingAnswer: false, message: 'Packages installed. Checking emulator compatibility…' });
          await this.api.onManagedConnect(root);
          this.update({ phase: 'ready', message: 'Official packages installed. See runtime verification in Settings.' });
          return;
        }
        // A status reply that pre-dates a license answer/cancel must not enable it again.
        if (version !== this.actionVersion || this.view.actionPending) { await this.wait(); continue; }
        this.update({ output: status.output, awaitingAnswer: status.awaiting_answer });
        await this.wait();
      }
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      if (sessionStarted) await this.api.onManagedCancel().catch(() => {});
      this.update({ phase: 'failed', awaitingAnswer: false, actionPending: false, message: 'Setup failed: ' + errorMessage(error) });
    }
  }

  async answer(yes: boolean): Promise<void> {
    if (this.view.phase !== 'installing' || !this.view.awaitingAnswer || this.view.actionPending) return;
    ++this.actionVersion;
    this.update({ awaitingAnswer: false, actionPending: true });
    try {
      await this.pendingStatus;
      if (this.view.phase === 'installing') await this.api.onManagedAnswer(yes);
    }
    catch (error) { this.update({ message: 'License response failed: ' + errorMessage(error) }); }
    finally { this.update({ actionPending: false }); }
  }

  async cancel(): Promise<void> {
    if (this.view.phase !== 'installing' || this.view.actionPending) return;
    ++this.actionVersion;
    this.update({ actionPending: true, awaitingAnswer: false, message: 'Cancelling setup…' });
    try {
      await this.pendingStatus;
      if (this.view.phase !== 'installing') { this.update({ actionPending: false }); return; }
      await this.api.onManagedCancel();
      ++this.generation;
      this.update({ phase: 'cancelled', message: 'Setup cancelled. You may retry.', actionPending: false });
    } catch (error) {
      // Never claim the process stopped unless the backend confirmed cancellation.
      this.update({ message: 'Unable to cancel: ' + errorMessage(error), actionPending: false });
    }
  }
}

function errorMessage(error: unknown): string {
  return (error as { message?: string } | null)?.message || String(error);
}
