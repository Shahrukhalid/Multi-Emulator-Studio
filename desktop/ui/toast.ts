export type ToastType = 'info' | 'success' | 'warning' | 'error';

class ToastShelf {
  private shelf: HTMLElement | null = null;

  private ensureShelf(): HTMLElement {
    if (!this.shelf || !document.body.contains(this.shelf)) {
      this.shelf = document.createElement('div');
      this.shelf.className = 'toast-shelf';
      document.body.appendChild(this.shelf);
    }
    return this.shelf;
  }

  show(message: string, type: ToastType = 'info', duration: number = 3500): void {
    const shelf = this.ensureShelf();
    const bubble = document.createElement('div');
    bubble.className = `toast-bubble ${type}`;

    const text = document.createElement('span');
    text.textContent = message;
    bubble.appendChild(text);

    shelf.appendChild(bubble);

    setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translateY(8px)';
      bubble.style.transition = 'all 0.18s ease-in';
      setTimeout(() => bubble.remove(), 180);
    }, duration);
  }
}

export const toast = new ToastShelf();
