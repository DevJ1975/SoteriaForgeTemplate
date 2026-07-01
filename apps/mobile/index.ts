/**
 * App entry point.
 *
 * Polyfills MUST load before anything else:
 *   - `react-native-get-random-values` gives `crypto.getRandomValues`, which
 *     `@soteria-forge/shared` `generateStatementId()` relies on to mint the
 *     CLIENT-GENERATED UUIDs that make xAPI sync idempotent. Without it the
 *     shared helper would throw at runtime.
 *   - `react-native-url-polyfill` provides a WHATWG `URL`, required by
 *     aws-amplify's networking on React Native.
 *
 * After polyfills we hand off to expo-router's file-based entry, which mounts
 * the `app/` route tree (root layout → providers → navigators).
 */
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import 'expo-router/entry';
