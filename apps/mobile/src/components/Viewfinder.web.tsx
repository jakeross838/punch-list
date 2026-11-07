// Preview page: the browser cannot show a live camera inside the preview, so the shutter opens the
// iPhone's own camera through a file input, and the photo comes straight back here.

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Icon, Text } from '@/ui';
import type { TakenPhoto, ViewfinderHandle } from './Viewfinder';

export type { TakenPhoto, ViewfinderHandle } from './Viewfinder';

function measure(uri: string): Promise<TakenPhoto> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ uri, width: img.naturalWidth || 1200, height: img.naturalHeight || 1600 });
    img.onerror = () => resolve({ uri, width: 1200, height: 1600 });
    img.src = uri;
  });
}

export function Viewfinder({ ref }: { ref?: Ref<ViewfinderHandle>; flash: boolean }) {
  const camera = useRef<HTMLInputElement | null>(null);
  const library = useRef<HTMLInputElement | null>(null);
  const waiting = useRef<((photos: TakenPhoto[]) => void) | null>(null);

  function open(input: HTMLInputElement | null, many = false): Promise<TakenPhoto[]> {
    if (!input) return Promise.resolve([]);
    waiting.current?.([]);
    return new Promise((resolve) => {
      waiting.current = resolve;
      input.value = '';
      input.multiple = many;
      input.click();
    });
  }

  async function chosen(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    const done = waiting.current;
    waiting.current = null;
    if (!done) return;
    done(await Promise.all(files.map((f) => measure(URL.createObjectURL(f)))));
  }

  // Closing the camera or the library without a photo.
  useEffect(() => {
    const inputs = [camera.current, library.current];
    const cancelled = () => {
      const done = waiting.current;
      waiting.current = null;
      done?.([]);
    };
    for (const el of inputs) el?.addEventListener('cancel', cancelled);
    return () => {
      for (const el of inputs) el?.removeEventListener('cancel', cancelled);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    take: async () => (await open(camera.current))[0] ?? null,
    pick: async () => (await open(library.current))[0] ?? null,
    pickMany: async (most: number) => (await open(library.current, true)).slice(0, most),
  }));

  return (
    <View style={styles.fill}>
      <View style={styles.hint}>
        <Icon name="camera" size={34} color={colors.onDarkQuiet} />
        <Text variant="subheadline" color={colors.onDarkQuiet} align="center">
          The shutter opens the iPhone camera.
        </Text>
      </View>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="camera-input"
        style={{ display: 'none' }}
        onChange={(e) => void chosen(e.currentTarget)}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        data-testid="library-input"
        style={{ display: 'none' }}
        onChange={(e) => void chosen(e.currentTarget)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
  hint: { alignItems: 'center', gap: 12, paddingHorizontal: 40 },
});
