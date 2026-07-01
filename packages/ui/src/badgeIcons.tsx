/**
 * Achievement glyphs for badges — stroke icons on a 24×24 grid.
 * Rendered via react-native-svg so they're crisp on iOS / Android / Web.
 *   <BadgeGlyph name="flame" size={30} color="#5A2E12" />
 */
import React from 'react';
import Svg, { Path, Circle, Polygon, Polyline, Line } from 'react-native-svg';

export type BadgeGlyphName =
  | 'flame' | 'star' | 'trophy' | 'shield' | 'bolt' | 'target'
  | 'grad' | 'crown' | 'medal' | 'safety' | 'check' | 'rocket' | 'lock';

export type BadgeGlyphProps = { name: BadgeGlyphName; size?: number; color?: string; strokeWidth?: number };

export function BadgeGlyph({ name, size = 28, color = '#5A2E12', strokeWidth = 2 }: BadgeGlyphProps) {
  const p = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'flame':
        return <Path {...p} d="M12 3c1.5 3 4.5 4.5 4.5 8.5A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.5C7.5 9 9 8 9.5 6.5c.7 1 2 1 2-1.5 0-.8.2-1.4.5-2z M12 21a3 3 0 0 0 3-3c0-2-3-3-3-5-.9 1.2-3 2.2-3 4.6" />;
      case 'star':
        return <Polygon {...p} points="12 3 14.6 8.7 21 9.4 16.3 13.8 17.6 20 12 16.9 6.4 20 7.7 13.8 3 9.4 9.4 8.7" />;
      case 'trophy':
        return <Path {...p} d="M7 4h10v5a5 5 0 0 1-10 0V4z M7 6H4v2a3 3 0 0 0 3 3 M17 6h3v2a3 3 0 0 1-3 3 M9 20h6 M10 20l.5-3.5h3L14 20" />;
      case 'shield':
        return <Path {...p} d="M12 3l7 2.5V11c0 5-3.5 7.8-7 9-3.5-1.2-7-4-7-9V5.5L12 3z M9 11.5l2 2 4-4" />;
      case 'bolt':
        return <Polygon {...p} points="13 2 4 14 11 14 10 22 20 9 13 9" />;
      case 'target':
        return <><Circle {...p} cx="12" cy="12" r="8" /><Circle {...p} cx="12" cy="12" r="4" /><Circle cx="12" cy="12" r="1.3" fill={color} /></>;
      case 'grad':
        return <Path {...p} d="M2 9l10-5 10 5-10 5L2 9z M6 11v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5 M22 9v5" />;
      case 'crown':
        return <Path {...p} d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 10h-13L4 8z M5.5 18h13" />;
      case 'medal':
        return <><Circle {...p} cx="12" cy="14" r="6" /><Path {...p} d="M8.5 8.5L6 3h4l2 3 2-3h4l-2.5 5.5" /><Path {...p} d="M12 11.5l1 2 2 .3-1.5 1.5.4 2-1.9-1-1.9 1 .4-2L9 13.8l2-.3z" /></>;
      case 'safety':
        return <Path {...p} d="M4 16a8 8 0 0 1 16 0 M4 16h16 M4 16v2h16v-2 M12 8V5 M12 8a5 5 0 0 0-5 5 M12 8a5 5 0 0 1 5 5" />;
      case 'rocket':
        return <Path {...p} d="M12 3c3 1.5 5 5 5 9l-2 3H9l-2-3c0-4 2-7.5 5-9z M12 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M9 18c-1 .5-2 2-2 3 1.2 0 2.3-.4 3-1 M15 18c1 .5 2 2 2 3-1.2 0-2.3-.4-3-1" />;
      case 'check':
        return <Polyline {...p} points="5 12.5 10 17.5 19 7" strokeWidth={strokeWidth + 0.6} />;
      case 'lock':
        return <><Path {...p} d="M7 10V8a5 5 0 0 1 10 0v2" /><Path {...p} d="M6 10h12v9H6z" /><Line {...p} x1="12" y1="13" x2="12" y2="16" /></>;
      default:
        return null;
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
