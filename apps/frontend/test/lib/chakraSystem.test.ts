import { defaultSystem } from '@chakra-ui/react';
import { chakraSystem } from '@/lib/chakraSystem';

/**
 * `chakraSystem` exists only to keep Chakra's unused recipes out of the bundle.
 * The failure mode it introduces is silent: drop a recipe a component still
 * renders and that component loses its styles without throwing. These tests pin
 * the trimmed system against `defaultSystem` so that regression is a red test
 * rather than a visual surprise.
 *
 * Adding a Chakra component? Add its recipe key to the list below AND to
 * src/lib/chakraSystem.ts. `dist/esm/theme/recipes.js` and `slot-recipes.js`
 * in @chakra-ui/react map component to key.
 */

/** Every recipe key reachable from a component we import. */
const RECIPES = [
  'button', // Button, and CloseButton -> IconButton -> Button
  'input', // Input
  'textarea', // Textarea
  'icon', // Field's create-icon, Select/NativeSelect indicators
  'checkmark', // Checkbox.Control
  'spinner', // Button's Loader, when `loading` is set
];

const SLOT_RECIPES = ['checkbox', 'dialog', 'field', 'nativeSelect', 'select', 'table'];

describe('chakraSystem', () => {
  it('registers every recipe our components resolve', () => {
    for (const key of RECIPES) {
      expect(chakraSystem.isRecipe(key)).toBe(true);
    }
    for (const key of SLOT_RECIPES) {
      expect(chakraSystem.isSlotRecipe(key)).toBe(true);
    }
  });

  it.each(RECIPES)('recipe %s is identical to defaultSystem', (key) => {
    expect(chakraSystem.getRecipe(key)).toStrictEqual(defaultSystem.getRecipe(key));
  });

  it.each(SLOT_RECIPES)('slot recipe %s is identical to defaultSystem', (key) => {
    expect(chakraSystem.getSlotRecipe(key)).toStrictEqual(defaultSystem.getSlotRecipe(key));
  });

  // The repo leans on Chakra's reset outranking Tailwind and uses `!`-prefixed
  // utilities to win; a changed reset would move borders and spacing everywhere.
  it('emits the same preflight, global CSS and design tokens', () => {
    expect(chakraSystem.getPreflightCss()).toStrictEqual(defaultSystem.getPreflightCss());
    expect(chakraSystem.getGlobalCss()).toStrictEqual(defaultSystem.getGlobalCss());
    expect(chakraSystem.getTokenCss()).toStrictEqual(defaultSystem.getTokenCss());
  });

  it.each([
    'colors.blue.500',
    'colors.border',
    'colors.bg',
    'colors.fg',
    'spacing.4',
    'radii.l2',
    'sizes.10',
    'fontSizes.md',
  ])('resolves token %s the same way', (token) => {
    expect(chakraSystem.token(token)).toStrictEqual(defaultSystem.token(token));
  });

  it('resolves the variants our components actually ask for', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['button', { variant: 'solid', size: 'md' }],
      ['button', { variant: 'ghost', size: 'sm' }],
      ['input', { variant: 'outline', size: 'md' }],
      ['textarea', { variant: 'outline', size: 'md' }],
      ['icon', {}],
      ['checkmark', { size: 'md' }],
      ['spinner', { size: 'md' }],
    ];
    for (const [key, variant] of cases) {
      const trimmed = chakraSystem.cva(chakraSystem.getRecipe(key))(variant);
      const original = defaultSystem.cva(defaultSystem.getRecipe(key))(variant);
      expect(chakraSystem.css(trimmed)).toStrictEqual(defaultSystem.css(original));
    }

    const slotCases: Array<[string, Record<string, string>]> = [
      ['table', { variant: 'line', size: 'md' }],
      ['dialog', { placement: 'center', size: 'md' }],
      ['select', { variant: 'outline', size: 'md' }],
      ['nativeSelect', { variant: 'outline', size: 'md' }],
      ['checkbox', { variant: 'solid', size: 'md' }],
      ['field', {}],
    ];
    for (const [key, variant] of slotCases) {
      expect(chakraSystem.sva(chakraSystem.getSlotRecipe(key))(variant)).toStrictEqual(
        defaultSystem.sva(defaultSystem.getSlotRecipe(key))(variant),
      );
    }
  });

  it('drops the recipes nothing renders', () => {
    // Guards the point of the change: if these come back, the trim regressed.
    for (const key of ['badge', 'heading', 'kbd', 'link', 'separator', 'skeleton', 'container']) {
      expect(defaultSystem.isRecipe(key)).toBe(true);
      expect(chakraSystem.isRecipe(key)).toBe(false);
    }
    for (const key of ['menu', 'tabs', 'drawer', 'popover', 'tooltip', 'accordion', 'toast']) {
      expect(defaultSystem.isSlotRecipe(key)).toBe(true);
      expect(chakraSystem.isSlotRecipe(key)).toBe(false);
    }
  });
});
