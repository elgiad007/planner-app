declare module "page-flip" {
  export class PageFlip {
    constructor(element: HTMLElement, settings: Record<string, unknown>);
    on(name: string, callback: (event: { data: unknown }) => void): void;
    loadFromHTML(elements: HTMLElement[]): void;
    flipNext(corner?: string): void;
    flipPrev(corner?: string): void;
    destroy(): void;
  }
}
