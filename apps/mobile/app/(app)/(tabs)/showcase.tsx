/**
 * Showcase tab — an in-app gallery of the @soteria-forge/ui kit so the team can
 * visually QA every component (and the ember/spark + Oswald/Barlow design
 * language) on a real device / simulator, in light and dark.
 *
 * The kit ships `ForgeUIShowcase`, a self-contained demo that manages its OWN
 * ThemeProvider (with a light/dark toggle), SafeAreaView and ScrollView. We
 * render it directly so it exercises the kit exactly as delivered — it is the
 * canonical reference screen, not a re-implementation. This route is a thin
 * wrapper, consistent with the rest of app/.
 */
import { ForgeUIShowcase } from '@soteria-forge/ui';

export default ForgeUIShowcase;
