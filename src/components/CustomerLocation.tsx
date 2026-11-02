import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/Text';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { tryPosition } from '@/lib/location';
import type { Job } from '@/lib/types';
import { toast } from '@/components/toast';
import { Banner, Button, Card, Icon } from '@/components/ui';
import { colors } from '@/components/theme';

/** Saves where the phone is now as the customer's location. */
export function useCollectLocation(job: Job) {
  const qc = useQueryClient();
  const [locating, setLocating] = useState(false);
  const collect = async () => {
    setLocating(true);
    try {
      const pos = await tryPosition(15000);
      if (!pos) {
        toast.error('Couldn’t get your location. Turn on GPS and try again.');
        return;
      }
      await api.post(`/jobs/${job.id}/customer-location`, pos);
      toast.success('Customer location saved');
      qc.invalidateQueries({ queryKey: ['tech-job', String(job.id)] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLocating(false);
    }
  };
  return { collect, locating };
}

/** Missing: asks the technician to collect it. Saved: says from whom, and lets them correct it on site. */
export function CustomerLocationCard({ job }: { job: Job }) {
  const { collect, locating } = useCollectLocation(job);
  const c = job.customer;
  if (c?.lat == null) {
    return (
      <Banner tone="warn" icon="location-outline" title="Customer location is missing" message="Collect it when you reach the customer’s place, so the next visit can navigate straight there.">
        <Button title="I’m at the customer’s place: save location" icon="navigate" size="sm" loading={locating} onPress={collect} />
      </Banner>
    );
  }
  const source = c.location_source ? { customer: 'Shared by the customer', office: 'Set by the office', technician: 'Saved on site' }[c.location_source] : 'Location saved';
  const replace = () =>
    Alert.alert('Replace the saved location?', 'Your current position becomes the customer’s location for every future visit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', onPress: collect },
    ]);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="checkmark-circle" size={22} color={colors.green} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>Customer location saved</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {source}
            {c.location_updated_at ? ` · ${dateTime(c.location_updated_at)}` : ''}
          </Text>
        </View>
        <Button title="Update" size="sm" variant="ghost" loading={locating} onPress={replace} />
      </View>
    </Card>
  );
}
