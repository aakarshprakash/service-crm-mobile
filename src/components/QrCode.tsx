import { useMemo } from 'react';
import QRCode from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';

/** QR code drawn with react-native-svg from the pure-JS encoder (no native QR module needed). */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [value]);
  const quiet = 2;
  const total = count + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${total} ${total}`} accessibilityLabel="UPI payment QR code">
      <Rect x={-quiet} y={-quiet} width={total} height={total} fill="#fff" />
      <Path d={path} fill="#000" />
    </Svg>
  );
}
