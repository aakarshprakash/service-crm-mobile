import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Text } from './Text';
import { Button, Icon, Input } from './ui';
import { colors } from './theme';

/**
 * Full-screen barcode / QR scanner for serial numbers. Scans the common 1D codes on
 * appliance rating plates (Code 128 / 39 / 93, EAN, UPC, ITF) plus QR and Data Matrix.
 * Shows what was read so the technician can confirm or edit before it is used.
 */
export function BarcodeScanner({ open, title = 'Scan serial number', onClose, onScanned }: { open: boolean; title?: string; onClose: () => void; onScanned: (value: string) => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const locked = useRef(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    locked.current = false;
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [open, permission?.granted]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBarcode = (r: BarcodeScanningResult) => {
    if (locked.current) return;
    const value = r.data?.trim();
    if (!value) return;
    locked.current = true;
    Vibration.vibrate(60);
    setResult(value);
  };

  const close = () => {
    setTorch(false);
    onClose();
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar', 'qr', 'datamatrix', 'pdf417'] }}
            onBarcodeScanned={result ? undefined : onBarcode}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <Icon name="camera-outline" size={48} color="#fff" />
            <Text style={{ color: '#fff', textAlign: 'center' }}>Allow camera access to scan the serial number.</Text>
            <Button title={permission?.canAskAgain === false ? 'Open settings' : 'Allow camera'} onPress={() => (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())} />
          </View>
        )}

        {/* Viewfinder */}
        {permission?.granted && !result && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <View style={{ width: '82%', height: 170, borderRadius: 18, borderWidth: 3, borderColor: colors.accent }} />
            <Text style={{ color: '#fff', marginTop: 16, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 6 }}>Point at the barcode on the rating plate</Text>
          </View>
        )}

        <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close scanner" style={styles.round}>
            <Icon name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{title}</Text>
          <Pressable onPress={() => setTorch((t) => !t)} hitSlop={12} accessibilityLabel={torch ? 'Torch off' : 'Torch on'} style={[styles.round, torch && { backgroundColor: colors.accent }]}>
            <Icon name={torch ? 'flash' : 'flash-outline'} size={22} color="#fff" />
          </Pressable>
        </View>

        {result !== null && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Scanned</Text>
            <Input value={result} onChangeText={setResult} autoCapitalize="characters" style={{ fontSize: 18 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Scan again" variant="secondary" icon="scan-outline" style={{ flex: 1 }} onPress={() => { setResult(null); locked.current = false; }} />
              <Button title="Use this" icon="checkmark" style={{ flex: 1 }} disabled={!result.trim()} onPress={() => { onScanned(result.trim()); close(); }} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
