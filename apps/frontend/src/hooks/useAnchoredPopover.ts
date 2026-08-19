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

/**
 * Chakra's dialog layer is also 1500, and on a tie paint order comes down to
 * which portal happens to be appended last. Sitting one above it keeps that
 * from being a coin flip.
 */
const POPOVER_Z_INDEX = 1600;

/** Below this the popover is too short to be worth opening on that side. */
const MIN_USABLE_HEIGHT = 96;

/**
 * Spread straight into the popover's `style`. Exactly one of `top`/`bottom` is
 * set: a flipped popover is pinned by its bottom edge so it stays against the
 * anchor whatever its content height turns out to be.
 */
export interface AnchoredPopoverPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  zIndex: number;
  /**
   * While a modal dialog is open Chakra makes every other child of `body`
   * non-interactive, and a portalled popover is one of those children. Without
   * this the popover renders but silently swallows every click.
   */
  pointerEvents: 'auto';
}

interface UseAnchoredPopoverOptions {
  open: boolean;
  /** Called on an outside click or Escape. */
  onDismiss: () => void;
  /** The popover's preferred height. Trimmed when the viewport is tighter. */
  maxHeight: number;
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
>({ open, onDismiss, maxHeight, width }: UseAnchoredPopoverOptions) {
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
    const maxLeft = window.innerWidth - popoverWidth - VIEWPORT_MARGIN;

    const spaceBelow =
      window.innerHeight - rect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - ANCHOR_GAP - VIEWPORT_MARGIN;
    // Opening downwards keeps the popover next to what the user just clicked,
    // so only flip when staying put would leave it unusably short.
    const flipAbove = spaceBelow < MIN_USABLE_HEIGHT && spaceAbove > spaceBelow;
    const available = flipAbove ? spaceAbove : spaceBelow;

    setPosition({
      ...(flipAbove
        ? { bottom: window.innerHeight - rect.top + ANCHOR_GAP }
        : { top: rect.bottom + ANCHOR_GAP }),
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft)),
      width: popoverWidth,
      maxHeight: Math.max(MIN_USABLE_HEIGHT, Math.min(maxHeight, available)),
      zIndex: POPOVER_Z_INDEX,
      pointerEvents: 'auto',
    });
  }, [maxHeight, width]);

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
