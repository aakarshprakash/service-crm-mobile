import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { enqueuePhoto } from './uploads';

const MAX_EDGE = 1600;

/**
 * Shrinks a camera / gallery photo to at most 1600px JPEG before it is queued: field
 * networks are slow and the office never needs more. If the phone can't process the
 * image (low memory, odd format) the original is queued and the server shrinks it.
 */
export async function preparePhoto(asset: { uri: string; width?: number; height?: number }): Promise<string> {
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const w = asset.width ?? 0;
    const h = asset.height ?? 0;
    if (Math.max(w, h) > MAX_EDGE) ctx.resize(w >= h ? { width: MAX_EDGE } : { height: MAX_EDGE });
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return asset.uri;
  }
}

export async function queuePhoto(visitId: number, type: string, asset: { uri: string; width?: number; height?: number }): Promise<void> {
  await enqueuePhoto(visitId, type, await preparePhoto(asset));
}
