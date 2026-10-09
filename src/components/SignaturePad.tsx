import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Button, Field, Icon, Input, Muted } from './ui';
import { colors } from './theme';

type Point = { x: number; y: number };

/** Smooth stroke: quadratic curves through the midpoints of successive samples. */
function toPath(points: Point[]): string {
  if (!points.length) return '';
  if (points.length < 3) {
    const p = points[0];
    const q = points[points.length - 1];
    return `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${(q.x + 0.1).toFixed(1)},${(q.y + 0.1).toFixed(1)}`;
  }
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q${points[i].x.toFixed(1)},${points[i].y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
}

/**
 * Full-screen customer sign-off. The drawing is exported as a PNG (white background)
 * and handed back as base64 with the signer's name.
 */
export function SignaturePad({ open, onClose, onSave, defaultName }: { open: boolean; onClose: () => void; onSave: (base64Png: string, signerName: string) => void; defaultName?: string }) {
  const insets = useSafeAreaInsets();
  const svg = useRef<Svg>(null);
  const [strokes, setStrokes] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [name, setName] = useState(defaultName ?? '');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const points = useRef<Point[]>([]);
  const inkPoints = useRef(0);
  // Bounding box of the ink, so the exported PNG is cropped to the signature itself.
  const box = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const grow = (p: Point) => {
    const b = box.current;
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        Keyboard.dismiss();
        points.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
        grow(points.current[0]);
        setCurrent(toPath(points.current));
      },
      onPanResponderMove: (e) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        const prev = points.current[points.current.length - 1];
        if (prev && Math.abs(prev.x - p.x) + Math.abs(prev.y - p.y) < 1.5) return;
        points.current.push(p);
        grow(p);
        setCurrent(toPath(points.current));
      },
      onPanResponderRelease: () => {
        const d = toPath(points.current);
        inkPoints.current += points.current.length;
        points.current = [];
        if (d) setStrokes((s) => [...s, d]);
        setCurrent('');
      },
    }),
  ).current;

  const clear = () => {
    setStrokes([]);
    setCurrent('');
    inkPoints.current = 0;
    box.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    setError(null);
  };

  const close = () => {
    clear();
    onClose();
  };

  const save = () => {
    if (!name.trim()) return setError('Enter the name of the person signing.');
    if (inkPoints.current < 8 || !strokes.length) return setError('Ask the customer to sign inside the box.');
    if (!svg.current) return;
    setSaving(true);
    const b = box.current;
    const pad = 12;
    const x = Math.max(0, b.minX - pad);
    const y = Math.max(0, b.minY - pad);
    // Zoom the drawing to its ink (with a little margin), then export on the next frame.
    setCrop({ x, y, w: Math.max(60, Math.min(size.width, b.maxX + pad) - x), h: Math.max(30, Math.min(size.height, b.maxY + pad) - y) });
  };

  useEffect(() => {
    if (!crop || !svg.current) return;
    const scale = Math.min(3, 1200 / crop.w, 600 / crop.h);
    const timer = setTimeout(() => {
      svg.current?.toDataURL(
        (base64) => {
          setSaving(false);
          setCrop(null);
          onSave(base64, name.trim());
          clear();
        },
        { width: Math.round(crop.w * scale), height: Math.round(crop.h * scale) },
      );
    }, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop]);

  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <Modal visible={open} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Customer signature</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <Field label="Signed by" required>
            <Input value={name} onChangeText={(v) => { setName(v); setError(null); }} placeholder="Customer name" autoCapitalize="words" returnKeyType="done" />
          </Field>
        </View>
        <View style={{ flex: 1, margin: 16, marginTop: 4, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#94A3B8', backgroundColor: '#fff', overflow: 'hidden' }}>
          <View style={{ flex: 1 }} onLayout={onLayout} {...responder.panHandlers}>
            {size.width > 0 && (
              <Svg
                ref={svg}
                width={crop ? (size.height * crop.w) / crop.h > size.width ? size.width : (size.height * crop.w) / crop.h : size.width}
                height={crop ? (size.width * crop.h) / crop.w > size.height ? size.height : (size.width * crop.h) / crop.w : size.height}
                viewBox={crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 0 ${size.width} ${size.height}`}
                pointerEvents="none"
              >
                <Rect x={0} y={0} width={size.width} height={size.height} fill="#FFFFFF" />
                {strokes.map((d, i) => (
                  <Path key={i} d={d} stroke="#0B2545" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                ))}
                {current ? <Path d={current} stroke="#0B2545" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
              </Svg>
            )}
            {!strokes.length && !current && (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' }}>
                <View style={{ width: '80%', borderBottomWidth: 1, borderBottomColor: colors.border }} />
                <Muted style={{ marginTop: 6 }}>Sign here</Muted>
              </View>
            )}
          </View>
        </View>
        {error && <Text style={{ color: colors.red, textAlign: 'center', marginBottom: 8 }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
          <Button title="Clear" variant="secondary" icon="refresh" style={{ flex: 1 }} onPress={clear} />
          <Button title="Save signature" icon="checkmark" style={{ flex: 2 }} loading={saving} onPress={save} />
        </View>
      </View>
    </Modal>
  );
}
