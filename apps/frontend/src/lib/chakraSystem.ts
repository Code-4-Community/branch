import { createSystem, defaultBaseConfig, defineConfig } from '@chakra-ui/react';
import {
  animationStyles,
  breakpoints,
  buttonRecipe,
  checkboxSlotRecipe,
  checkmarkRecipe,
  cssVarsPrefix,
  cssVarsRoot,
  dialogSlotRecipe,
  fieldSlotRecipe,
  globalCss,
  iconRecipe,
  inputRecipe,
  keyframes,
  layerStyles,
  nativeSelectSlotRecipe,
  selectSlotRecipe,
  semanticTokens,
  spinnerRecipe,
  tableSlotRecipe,
  textareaRecipe,
  textStyles,
  tokens,
} from '@chakra-ui/react/theme';

/**
 * Chakra's `defaultSystem` registers all ~19 recipes and ~54 slot recipes, and
 * the whole table lands in the shared chunk on every route — including
 * /dashboard and /projects, which render no Chakra at all. This rebuilds the
 * same system from `defaultBaseConfig` with only the recipes we actually
 * render, which lets the bundler drop the rest.
 *
 * Everything that is not a recipe (conditions, utilities, tokens, preflight,
 * globalCss, cssVars naming) is kept byte-identical to `defaultSystem`, so the
 * CSS reset still outranks Tailwind exactly as before.
 *
 * Adding a Chakra component means adding its recipe here, or it renders
 * unstyled without throwing. `recipes.js` / `slot-recipes.js` in
 * `@chakra-ui/react/dist/esm/theme` map component to recipe key.
 */
const themeConfig = defineConfig({
  preflight: true,
  cssVarsPrefix,
  cssVarsRoot,
  globalCss,
  theme: {
    breakpoints,
    keyframes,
    tokens,
    semanticTokens,
    // Kept whole: the recipes below reference textStyle/layerStyle/animationStyle
    // by name, and they are ~6 KB unminified in total.
    textStyles,
    layerStyles,
    animationStyles,
    recipes: {
      button: buttonRecipe,
      input: inputRecipe,
      textarea: textareaRecipe,
      // icon: Field and the Select/NativeSelect indicators render Chakra icons.
      icon: iconRecipe,
      // checkmark: Checkbox.Control renders it.
      checkmark: checkmarkRecipe,
      // spinner: Button renders a Loader when `loading` is set.
      spinner: spinnerRecipe,
    },
    slotRecipes: {
      checkbox: checkboxSlotRecipe,
      dialog: dialogSlotRecipe,
      field: fieldSlotRecipe,
      nativeSelect: nativeSelectSlotRecipe,
      select: selectSlotRecipe,
      table: tableSlotRecipe,
    },
  },
});

export const chakraSystem = createSystem(defaultBaseConfig, themeConfig);
