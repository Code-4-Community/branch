'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

export interface AnchoredPopoverPosition {
  top: number;
  left: number;
  width: number;
}

interface UseAnchoredPopoverOptions {
  open: boolean;
  /** Called on an outside click or Escape. */
  onDismiss: () => void;
  /**
   * Used only to decide whether the popover should flip above the anchor, so an
   * approximation of the tallest state is fine.
   */
  estimatedHeight: number;
  /** Fixed width in px. Omitted, the popover matches the anchor's width. */
  width?: number;
}

/**
 * Positions a popover against an anchor in viewport coordinates, so the popover
 * can be portalled to `document.body`.
 *
 * Laying these popovers out in normal flow is not enough: they open inside the
 * project modal, whose body is a scroll container, and an in-flow popover gets
 * clipped by it. Portalling escapes the clip, which in turn means the position
 * has to be computed by hand and kept in sync while anything scrolls.
 */
export function useAnchoredPopover<
  A extends HTMLElement,
  P extends HTMLElement,
  B extends HTMLElement = A,
>({ open, onDismiss, estimatedHeight, width }: UseAnchoredPopoverOptions) {
  const anchorRef = useRef<A | null>(null);
  const popoverRef = useRef<P | null>(null);
  /** Optional wider region that also counts as "inside" for dismissal. */
  const boundaryRef = useRef<B | null>(null);
  const [position, setPosition] = useState<AnchoredPopoverPosition | null>(
    null,
  );

  // Read through a ref so an inline `onDismiss` does not re-subscribe the
  // listeners on every render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const popoverWidth = width ?? rect.width;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipAbove =
      spaceBelow < estimatedHeight + VIEWPORT_MARGIN && rect.top > spaceBelow;
    const maxLeft = window.innerWidth - popoverWidth - VIEWPORT_MARGIN;

    setPosition({
      top: flipAbove
        ? Math.max(VIEWPORT_MARGIN, rect.top - ANCHOR_GAP - estimatedHeight)
        : rect.bottom + ANCHOR_GAP,
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft)),
      width: popoverWidth,
    });
  }, [estimatedHeight, width]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // Capture phase, because scroll does not bubble and the element that
    // actually scrolls is the modal body rather than the window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inside = boundaryRef.current ?? anchorRef.current;
      if (inside?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onDismissRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Without this the surrounding dialog closes along with the popover.
      event.stopPropagation();
      onDismissRef.current();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { anchorRef, popoverRef, boundaryRef, position };
}
