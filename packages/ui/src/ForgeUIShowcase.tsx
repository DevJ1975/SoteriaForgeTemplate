/**
 * ForgeUIShowcase — a live demo screen exercising every component.
 * Drop into your app to sanity-check the library, or copy patterns from it.
 *
 *   import { ForgeUIShowcase } from '@soteria-forge/ui';
 *   export default function App() { return <ForgeUIShowcase />; }
 */
import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text } from 'react-native';
import {
  ThemeProvider, lightTheme, darkTheme, useTheme,
  Button, TextField, Select, Slider, Switch, Checkbox, RadioGroup,
  Card, Badge, Chip, ProgressBar, Divider, Wordmark,
} from './index';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 14, marginBottom: 28 }}>
      <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 12, letterSpacing: 3, color: t.colors.textMuted, textTransform: 'uppercase' }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Demo() {
  const t = useTheme();
  const [text, setText] = useState('');
  const [role, setRole] = useState('gate');
  const [volume, setVolume] = useState(64);
  const [notify, setNotify] = useState(true);
  const [agree, setAgree] = useState(false);
  const [shift, setShift] = useState('am');
  const [chip, setChip] = useState('security');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg }} contentContainerStyle={{ padding: 22, paddingBottom: 60 }}>
      <View style={{ marginBottom: 26 }}>
        <Wordmark size={24} onDark={t.mode === 'dark'} />
      </View>

      <Section title="Buttons">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Button title="Primary" onPress={() => {}} />
          <Button title="Secondary" variant="secondary" onPress={() => {}} />
          <Button title="Ghost" variant="ghost" onPress={() => {}} />
          <Button title="Danger" variant="danger" onPress={() => {}} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Button title="Small" size="sm" onPress={() => {}} />
          <Button title="Large" size="lg" onPress={() => {}} />
          <Button title="Loading" loading onPress={() => {}} />
          <Button title="Disabled" disabled onPress={() => {}} />
        </View>
        <Button title="Full width" fullWidth onPress={() => {}} />
      </Section>

      <Section title="Inputs">
        <TextField label="Full name" placeholder="Monica Lynn Green" value={text} onChangeText={setText} />
        <TextField label="Email" placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" helperText="We never share your address." />
        <TextField label="Password" placeholder="••••••••" secureTextEntry errorText="Must be at least 8 characters." />
        <Select
          label="Primary role"
          value={role}
          onChange={setRole}
          options={[
            { label: 'Gate agent', value: 'gate' },
            { label: 'Ramp crew', value: 'ramp' },
            { label: 'Terminal / concourse', value: 'terminal' },
            { label: 'Curbside', value: 'curb' },
          ]}
        />
      </Section>

      <Section title="Slider">
        <Slider label="Cohort readiness target" value={volume} onChange={setVolume} showValue min={0} max={100} step={1} />
      </Section>

      <Section title="Toggles & choices">
        <Switch label="Push notifications" value={notify} onValueChange={setNotify} />
        <Checkbox label="I agree to the safety policy" checked={agree} onChange={setAgree} />
        <RadioGroup
          value={shift}
          onChange={setShift}
          options={[
            { label: 'Morning', value: 'am', description: '05:00 – 13:00' },
            { label: 'Afternoon', value: 'pm', description: '13:00 – 21:00' },
            { label: 'Overnight', value: 'night', description: '21:00 – 05:00' },
          ]}
        />
      </Section>

      <Section title="Chips">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['security', 'wayfinding', 'de-escalation', 'curbside'].map((c) => (
            <Chip key={c} label={c} selected={chip === c} onPress={() => setChip(c)} />
          ))}
        </View>
      </Section>

      <Section title="Card, badges & progress">
        <Card raised>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 20, color: t.colors.text }}>Working at Heights</Text>
            <Badge label="Required" tone="danger" />
          </View>
          <ProgressBar value={0.64} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Badge label="Module 3" tone="primary" />
            <Badge label="Certified" tone="success" />
            <Badge label="xAPI" tone="info" />
          </View>
          <Divider spacing={16} />
          <Button title="Resume module" fullWidth onPress={() => {}} />
        </Card>
      </Section>
    </ScrollView>
  );
}

export default function ForgeUIShowcase() {
  const [dark, setDark] = useState(false);
  return (
    <ThemeProvider theme={dark ? darkTheme : lightTheme}>
      <SafeAreaView style={{ flex: 1, backgroundColor: dark ? darkTheme.colors.bg : lightTheme.colors.bg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 22, paddingTop: 12 }}>
          <Switch label="Dark" value={dark} onValueChange={setDark} />
        </View>
        <Demo />
      </SafeAreaView>
    </ThemeProvider>
  );
}
