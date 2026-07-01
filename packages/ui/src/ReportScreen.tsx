/**
 * ReportScreen — a branded, scrollable report document assembled from the
 * document primitives. Mirrors the print report design for on-device / web.
 *
 *   import { ReportScreen } from '@soteria-forge/ui';
 */
import React from 'react';
import { SafeAreaView, ScrollView, View, Text } from 'react-native';
import {
  ThemeProvider, lightTheme, useTheme,
  Logo, SectionHeading, StatTile, DataTable, TrendChart, Badge, Divider,
} from './index';

function ReportBody() {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* COVER */}
      <View style={{ backgroundColor: '#16181D', padding: 28, paddingTop: 40, paddingBottom: 34 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Logo size={34} />
          <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 20, color: '#F4F2EE' }}>
            SOTERIA<Text style={{ color: '#FF7A3D' }}> FORGE</Text>
          </Text>
        </View>
        <View style={{ marginTop: 30 }}>
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(232,85,31,0.16)', borderColor: 'rgba(255,122,61,0.4)', borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, marginBottom: 16 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF7A3D' }} />
            <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 12, letterSpacing: 2, color: '#FFC9AE' }}>QUARTERLY TRAINING REPORT</Text>
          </View>
          <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 40, lineHeight: 42, color: '#F7F5F1' }}>Workforce Readiness & Compliance</Text>
          <Text style={{ fontFamily: t.fonts.body, fontSize: 16, lineHeight: 23, color: '#C2C7CE', marginTop: 14 }}>
            Hartsfield-Jackson ATL — de-escalation & safety program, Q2 2026 performance summary.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 28, paddingTop: 22, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' }}>
          {[['PREPARED FOR', 'Charles Pettis'], ['PREPARED BY', 'Monica Lynn Green'], ['PERIOD', 'Apr – Jun 2026'], ['REPORT ID', 'SF-RPT-2026-Q2']].map(([k, v]) => (
            <View key={k} style={{ width: '44%' }}>
              <Text style={{ fontFamily: t.fonts.body, fontWeight: '600', fontSize: 11, letterSpacing: 2, color: '#7E848C', marginBottom: 5 }}>{k}</Text>
              <Text style={{ fontFamily: t.fonts.display, fontWeight: '600', fontSize: 17, color: '#F4F2EE' }}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CONTENT */}
      <View style={{ padding: 24, gap: 22 }}>
        <View>
          <SectionHeading index={1} title="Executive summary" />
          <Text style={{ fontFamily: t.fonts.body, fontSize: 15, lineHeight: 24, color: t.colors.textMuted, marginTop: 10 }}>
            The Q2 de-escalation and safety program reached <Text style={{ color: t.colors.text, fontWeight: '600' }}>2,140 frontline workers</Text> across four concourses. Cohort readiness rose 22 points quarter-over-quarter, with certification and ASQ safety touchpoints both trending up.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile value="87%" label="completion" />
          <StatTile value="94%" label="certification" />
          <StatTile value="+22" label="readiness pts" />
          <StatTile value="4.6" label="ASQ touchpt" />
        </View>

        <View>
          <SectionHeading index={2} title="Completion by concourse" style={{ marginBottom: 14 }} />
          <DataTable
            columns={[
              { key: 'team', label: 'Team', flex: 2 },
              { key: 'enr', label: 'Enrolled', align: 'right' },
              { key: 'done', label: 'Complete', align: 'right' },
              { key: 'rate', label: 'Rate', align: 'right' },
            ]}
            rows={[
              { team: 'Concourse B · Gate ops', enr: 612, done: 571, rate: { text: '93%', color: t.colors.success, bold: true } },
              { team: 'Security · T-North', enr: 488, done: 451, rate: { text: '92%', color: t.colors.success, bold: true } },
              { team: 'Ramp · Concourse D', enr: 534, done: 427, rate: { text: '80%', color: t.colors.warning, bold: true } },
              { team: 'Curbside · North', enr: 506, done: 372, rate: { text: '74%', color: t.colors.danger, bold: true } },
            ]}
          />
        </View>

        <View>
          <SectionHeading index={3} title="Readiness trend" style={{ marginBottom: 14 }} />
          <View style={{ backgroundColor: t.colors.card, borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radii.md, padding: 18 }}>
            <TrendChart data={[32, 40, 37, 55, 61, 76, 84, 92]} labels={['APR', '', 'MAY', '', 'JUN', '', '', 'Q2']} height={170} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Badge label="Confidential" tone="danger" />
          <Badge label="Q2 2026" tone="primary" />
          <Badge label="xAPI verified" tone="info" />
        </View>
      </View>
    </ScrollView>
  );
}

export default function ReportScreen() {
  return (
    <ThemeProvider theme={lightTheme}>
      <SafeAreaView style={{ flex: 1, backgroundColor: lightTheme.colors.bg }}>
        <ReportBody />
      </SafeAreaView>
    </ThemeProvider>
  );
}
