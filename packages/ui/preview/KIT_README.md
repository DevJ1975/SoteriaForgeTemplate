# Soteria Forge UI

A comprehensive, cross-platform component library for the **Soteria Forge** brand.
One codebase renders on **iOS, Android, and Web** (via `react-native-web`).

Everything is themed from a single token source (`theme.ts`) — ember/charcoal palette,
Oswald + Barlow Semi Condensed type, consistent radii, spacing, and elevation —
with built-in **light and dark** schemes.

## What's included

| Component | File | Notes |
|---|---|---|
| `Button` | `Button.tsx` | `primary` / `secondary` / `ghost` / `danger`, 3 sizes, loading, icons, full-width |
| `TextField` | `TextField.tsx` | label, helper/error, adornments, password, multiline |
| `Select` | `Select.tsx` | dropdown via Modal overlay — no native picker deps |
| `Slider` | `Slider.tsx` | custom Responder-based slider, no native module |
| `Switch` | `Switch.tsx` | themed platform toggle |
| `Checkbox` | `Checkbox.tsx` | |
| `RadioGroup` | `RadioGroup.tsx` | with optional descriptions |
| `Card` | `Card.tsx` | surface + border + elevation |
| `Badge` | `Badge.tsx` | 6 tones, solid or soft |
| `Chip` | `Chip.tsx` | selectable filter chip |
| `ProgressBar` | `ProgressBar.tsx` | |
| `Divider` | `Divider.tsx` | |
| `Dialog` | `Dialog.tsx` | modal dialog / alert with actions |
| `Tabs` | `Tabs.tsx` | underline tab bar, optional scrollable |
| `Accordion` | `Accordion.tsx` | collapsible panels, single or multi |
| `Avatar` | `Avatar.tsx` | image or initials, status dot + count badge |
| `Toast` | `Toast.tsx` | `ToastProvider` + `useToast()` snackbar |
| `DatePicker` | `DatePicker.tsx` | self-contained calendar in a modal |
| `AchievementBadge` | `AchievementBadge.tsx` | metallic medallion — 5 tiers, 4 shapes, locked state |
| `RankMedal` | `RankMedal.tsx` | ribboned leaderboard medal (gold/silver/bronze + steel) |
| `LeaderboardRow` | `LeaderboardRow.tsx` | standing: medal, avatar, name, score, movement |
| `BadgeGlyph` | `badgeIcons.tsx` | 13 achievement glyphs (flame, trophy, shield…) |
| `SectionHeading` | `SectionHeading.tsx` | numbered report section title |
| `StatTile` | `StatTile.tsx` | KPI number + label tile |
| `DataTable` | `DataTable.tsx` | branded table, per-cell colour |
| `TrendChart` | `TrendChart.tsx` | area + line chart (react-native-svg) |
| `ReportPage` / `ScaledSurface` | `ReportPage.tsx` | fixed-proportion "paper" page that scales to fit |
| `Certificate` | `Certificate.tsx` | branded certificate w/ gold seal, prop-driven |
| `Logo` / `Wordmark` | `Logo.tsx` | the Forged Shield mark as SVG |
| Icons | `icons.tsx` | Check, ChevronDown, Close, Search |
| Theme | `theme.ts` | tokens, `ThemeProvider`, `useTheme`, `elevation()` |
| Showcase | `ForgeUIShowcase.tsx` | live demo of everything |

## Install

Copy the `soteria-forge-ui/` folder into your project (e.g. `src/ui/`). Then install
the two peer dependencies:

```bash
# from your app root
npm install react-native-svg
# Web only (if you run react-native-web): make sure these are set up
npm install react-native-web react-dom
```

`react-native-svg` powers the logo and icons. For **Expo**, use `npx expo install react-native-svg`
so the version matches your SDK. For **bare React Native**, run `cd ios && pod install` after installing.

### Fonts (important)

The design uses **Oswald** (display) and **Barlow Semi Condensed** (body). Load them once at
app start, then the family names in `theme.ts` (`fonts.display`, `fonts.body`) resolve.

- **Expo:** `npx expo install @expo-google-fonts/oswald @expo-google-fonts/barlow-semi-condensed expo-font`, load with `useFonts`, then set `fonts` in `theme.ts` to the exact names (e.g. `Oswald_700Bold`).
- **Bare RN:** add the `.ttf` files to `assets/fonts`, set `react-native.config.js` assets, run `npx react-native-asset`.
- **Web:** add the Google Fonts `<link>` to your HTML head.

If a font isn't registered the platform falls back to the system font — the app still runs.

## Usage

Wrap your app once (optional — defaults to light):

```tsx
import { ThemeProvider, darkTheme } from './ui/soteria-forge-ui';

export default function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <RootNavigator />
    </ThemeProvider>
  );
}
```

Then use components anywhere:

```tsx
import { Button, TextField, Select, Slider, Card, Badge, Logo } from './ui/soteria-forge-ui';

<Card raised>
  <Logo size={40} />
  <TextField label="Email" placeholder="you@company.com" value={email} onChangeText={setEmail} />
  <Select label="Role" value={role} onChange={setRole} options={roles} />
  <Slider label="Readiness" value={pct} onChange={setPct} showValue />
  <Button title="Save" onPress={onSave} />
</Card>
```

## Theming

- `useTheme()` returns the active `Theme` (`colors`, `radii`, `spacing`, `fonts`).
- Switch schemes by passing `lightTheme` or `darkTheme` to `ThemeProvider`.
- To rebrand, edit `palette` / `lightTheme` / `darkTheme` in `theme.ts` — every component updates.
- `elevation(1|2|3)` returns the correct shadow object per platform (iOS shadow, Android elevation, web box-shadow).

## Design tokens

```
Ember      #E8551F   primary
Ember hot  #FF7A3D   primary on dark
Spark      #FFB552   accent
Ink        #1A1D22   text / headings (light)
Charcoal   #1B1E23   dark surfaces
Paper      #F1EEE8   light background
Radii      8 / 12 / 16 / 20 / 999
Spacing    4 / 8 / 12 / 16 / 20 / 24 / 32
Type       Oswald (display) · Barlow Semi Condensed (body)
```

## Overlays (Dialog, Toast, DatePicker)

`Dialog` and `DatePicker` are self-contained — render them anywhere and control with state.

`Toast` uses a provider + hook. Wrap your app root **once** (inside `ThemeProvider`):

```tsx
import { ThemeProvider, ToastProvider, useToast } from './ui/soteria-forge-ui';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RootNavigator />
      </ToastProvider>
    </ThemeProvider>
  );
}

// anywhere below:
const toast = useToast();
toast('Module saved', { type: 'success' });
```

## Badges & leaderboards

Two families, both SVG (crisp at any size, iOS/Android/web):

**`AchievementBadge`** — a metallic medallion for accomplishments.

```tsx
<AchievementBadge tier="gold" icon="trophy" shape="rosette" label="Top Performer" sublabel="Q2 cohort" />
<AchievementBadge tier="ember" icon="flame" shape="shield" label="7-Day Streak" />
<AchievementBadge tier="gold" icon="trophy" locked label="Locked" sublabel="Reach rank 1" />
```

- `tier`: `bronze | silver | gold | ember | platinum`
- `shape`: `rosette | shield | hexagon | circle`
- `icon`: any `BadgeGlyphName` (`flame, star, trophy, shield, bolt, target, grad, crown, medal, safety, check, rocket, lock`) — or pass `renderIcon={(size,color)=>…}` for a custom mark.
- `locked` swaps to a greyed medallion + lock glyph. Omit `label`/`sublabel` to render just the medallion.

**`RankMedal`** + **`LeaderboardRow`** — standings.

```tsx
<LeaderboardRow rank={1} name="A. Okafor" sublabel="Ramp · Concourse D" score={2480} scoreUnit="pts" delta={2} avatarSource={photoUrl} />
<LeaderboardRow rank={4} name="You" score={2044} scoreUnit="pts" delta={3} highlight />
```

`rank` 1–3 render gold/silver/bronze ribboned medals automatically; 4+ show the number. `delta` is the rank change (`+2` up/green, `-1` down/red, `0` steady). `highlight` tints the row as the current user. Use `RankMedal` on its own for a podium.

## Documents & reports

Branded building blocks for reports, dashboards and summaries — the same visual system as the print templates, rendered on-device / web. `ReportScreen.tsx` is a complete, scrollable example assembling all of them:

```tsx
import ReportScreen from './ui/soteria-forge-ui/ReportScreen';

// or compose your own:
import { SectionHeading, StatTile, DataTable, TrendChart } from './ui/soteria-forge-ui';

<SectionHeading index={1} title="Executive summary" />

<View style={{ flexDirection:'row', gap:12 }}>
  <StatTile value="87%" label="completion" />
  <StatTile value="94%" label="certification" />
</View>

<DataTable
  columns={[{ key:'team', label:'Team', flex:2 }, { key:'rate', label:'Rate', align:'right' }]}
  rows={[{ team:'Concourse B', rate:{ text:'93%', color:'#1F8A5B', bold:true } }]}
/>

<TrendChart data={[32,40,37,55,61,76,84,92]} labels={['APR','MAY','JUN','Q2']} />
```

`DataTable` cells are `string | number | { text, color, bold }` — pass a colour for pass/at-risk rates. `TrendChart` scales to its container width and takes a plain `number[]`.

### Fixed "paper" pages in-app

`ReportPage` renders content at an exact page size (Letter @96dpi by default) and **scales the whole page to fit** its container — so the document keeps its proportions and layout instead of reflowing. Stack pages in a `ScrollView` for a paginated feel, with running header/footer and page numbers:

```tsx
<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
  <ReportPage orientation="portrait" headerTitle="WORKFORCE READINESS · Q2" pageNumber={1}>
    <SectionHeading index={1} title="Executive summary" />
    {/* …sections… */}
  </ReportPage>
</ScrollView>
```

`ScaledSurface` is the underlying scaler if you want to build your own fixed-size artboards. (Uses `transformOrigin`; React Native 0.74+ and react-native-web.)

### Certificate

`Certificate` is a print-proportioned, **prop-driven** certificate (gold verification seal, ornamental border, dual signatures) that scales to fit like `ReportPage`:

```tsx
<Certificate
  recipientName="Monica Lynn Green"
  courseName="Frontline De-escalation & Safety Certification"
  completionDate="June 30, 2026"
  hours="8.0 CEU"
  score="94%"
  certId="SF-ATL-2026-0142"
/>
```

For a **printable / PDF** version, the fixed-size HTML templates (`Soteria Forge Report.dc.html`, `Soteria Forge Certificate.dc.html`) remain the right tool — the RN components above are for the live app.

## Platform notes

- No native-only modules are required beyond `react-native-svg`; `Select` and `Slider` are
  built from core primitives so they behave identically on web.
- `preview.html` in this folder is a **static visual reference** of the components (open in any
  browser) — it is documentation, not part of the shipped library.
- Written in TypeScript; works in JS projects too (rename imports / ignore types).
