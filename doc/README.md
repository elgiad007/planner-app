# Project documentation

Keep project decisions and useful operating instructions here so they remain available outside chat history.

- [Implementation plan](implementation-plan.md)
- [Data storage and backups](data-storage.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Running, hosting, and updating](running-and-hosting.md)
- [Phase 1 testing and current limits](phase-1-testing.md)
- [Phase 2 page turning and iPad acceptance](phase-2-testing.md)
- [Phase 3 customization and iPad acceptance](phase-3-testing.md)
- [Phase 4 reliability, PDF export and iPad acceptance](phase-4-testing.md)
- [iPad handwriting reliability fix and retest checklist](ipad-handwriting-fix.md)

Status: Phase 4 implementation authorized by Luc on 2026-10-25. Reliability and PDF review build available; real-iPad acceptance testing remains required. No deployment performed.

Last updated: 2026-10-25.

## Text blocks

Choose **Text** in the writing toolbar, then click or tap a page. Enter multiline text and set its font size and box dimensions, then choose **Save text**. Select a block using Text or Select / move. Drag the block to move it, or its bottom-right corner to resize it. **Edit text** reopens the contents and size controls; **Delete text** removes the selected block. **Done** clears selection. The existing color palette sets new text color and recolors selected text. Text beyond the box is clipped; increase its height to show more lines. Undo/redo, backups, duplication, page turns, and PDF exports include text blocks.

Run `pnpm test:text` against the local server (default port 4173, or set `PLANNER_TEST_URL`). The browser check covers creation, editing, shared colors, movement, resizing, persistence, undo/redo, touch, zoom, and PDF output. Real-iPad acceptance testing remains required.
