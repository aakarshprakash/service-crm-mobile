import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState, type RecordingOptions,
} from 'expo-audio';
import { api } from '@/lib/api';
import { discardUpload, enqueueVoice, retryUpload, useUploads } from '@/lib/uploads';
import type { Visit } from '@/lib/types';
import { Text } from './Text';
import { toast } from './toast';
import { Card, Icon, Muted } from './ui';
import { colors } from './theme';

/** Speech: mono AAC in an .m4a, ~0.5 MB a minute. */
const VOICE: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 };
const MAX_SECONDS = 300;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Record voice notes on a visit (what the customer said, what to order…) and play them back. */
export function VoiceNotes({ visit }: { visit: Visit }) {
  const qc = useQueryClient();
  const recorder = useAudioRecorder(VOICE);
  // Once a second is enough for the m:ss clock (and keeps the screen from redrawing constantly).
  const rec = useAudioRecorderState(recorder, 1000);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useUploads(visit.id).filter((u) => u.kind === 'voice');
  const saved = visit.voice_notes ?? [];
  const seconds = Math.floor((rec.durationMillis ?? 0) / 1000);
  const stopping = useRef(false);

  const start = async () => {
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone access needed', 'Allow the microphone for Servon to record voice notes.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      player.pause();
      setPlayingId(null);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      toast.error('Couldn’t start recording. Close other apps using the microphone and try again.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    setBusy(true);
    const secs = Math.round((recorder.currentTime ?? 0) || seconds);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error('no file');
      if (secs < 1) {
        toast.info('Too short. Hold on a little longer.');
        return;
      }
      await enqueueVoice(visit.id, uri, secs);
      toast.success('Voice note saved');
    } catch {
      toast.error('Couldn’t save the recording.');
    } finally {
      stopping.current = false;
      setBusy(false);
    }
  };

  // Hard limit so a forgotten recording doesn't fill the phone.
  useEffect(() => {
    if (rec.isRecording && seconds >= MAX_SECONDS) stop();
  }, [rec.isRecording, seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status.didJustFinish) setPlayingId(null);
  }, [status.didJustFinish]);

  const toggle = (id: string, uri: string) => {
    if (playingId === id) {
      if (status.playing) player.pause();
      else player.play();
      return;
    }
    player.replace({ uri });
    player.play();
    setPlayingId(id);
  };

  const removeSaved = (noteId: number) =>
    Alert.alert('Delete this voice note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          api
            .delete(`/visits/${visit.id}/voice-notes/${noteId}`)
            .then(() => qc.invalidateQueries({ queryKey: ['visit', String(visit.id)] }))
            .catch((e: Error) => toast.error(e.message)),
      },
    ]);

  const rows = [
    ...saved.map((n) => ({ key: `s${n.id}`, uri: n.url, secs: n.duration_seconds, state: 'saved' as const, onLongPress: () => removeSaved(n.id) })),
    ...pending.map((u) => ({
      key: `q${u.id}`,
      uri: u.uri,
      secs: u.duration ?? 0,
      state: u.status === 'failed' ? ('failed' as const) : u.status === 'uploading' ? ('uploading' as const) : ('waiting' as const),
      onLongPress: () =>
        Alert.alert(u.status === 'failed' ? 'Voice note not uploaded' : 'Voice note waiting to upload', u.error ?? 'It uploads automatically when the connection is back.', [
          { text: 'Close', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => discardUpload(u.id) },
          { text: 'Retry now', onPress: () => retryUpload(u.id) },
        ]),
    })),
  ];

  return (
    <Card title="Voice notes" right={<Muted>{rows.length || ''}</Muted>}>
      {rows.map((r) => {
        const active = playingId === r.key;
        const progress = active && status.duration ? Math.min(1, status.currentTime / status.duration) : 0;
        return (
          <Pressable key={r.key} onPress={() => toggle(r.key, r.uri)} onLongPress={r.onLongPress} accessibilityHint="Long press for options" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: active && status.playing ? colors.brand : colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={active && status.playing ? 'pause' : 'play'} size={18} color={active && status.playing ? colors.onBrand : colors.brand} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
                <View style={{ width: `${progress * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.brand }} />
              </View>
              <Muted style={{ fontSize: 12 }}>
                {clock(active ? status.currentTime : r.secs)}
                {r.state === 'uploading' ? ' · uploading…' : r.state === 'waiting' ? ' · waiting to upload' : r.state === 'failed' ? ' · not uploaded, long-press' : ''}
              </Muted>
            </View>
            {r.state === 'failed' && <Icon name="alert-circle" color={colors.red} />}
          </Pressable>
        );
      })}

      {rec.isRecording ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: rows.length ? 8 : 0, padding: 12, borderRadius: 14, backgroundColor: colors.redSoft }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red }} />
          <Text style={{ flex: 1, fontWeight: '700', color: colors.red, fontSize: 16 }}>Recording {clock(seconds)}</Text>
          <Pressable onPress={stop} disabled={busy} accessibilityLabel="Stop recording" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="stop" size={22} color={colors.onBrand} />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={start} disabled={busy} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: rows.length ? 8 : 0, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.brandSoft : colors.card, opacity: busy ? 0.6 : 1 })}>
          <Icon name="mic-outline" size={20} color={colors.brand} />
          <Text style={{ color: colors.brand, fontWeight: '600' }}>Record a voice note</Text>
        </Pressable>
      )}
      {!rows.length && !rec.isRecording && <Muted style={{ marginTop: 8, fontSize: 12 }}>What the customer said, parts to order, things to check next time.</Muted>}
    </Card>
  );
}
