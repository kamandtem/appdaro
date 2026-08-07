/**
 * Resizes/compresses an uploaded image file down to a small data URL before it gets
 * stored in the app's localStorage-backed state. Uncompressed photos (avatars, medication
 * photos) can easily push the serialized app state past the browser's localStorage quota;
 * when that happens `localStorage.setItem` throws and the whole save silently fails, which
 * looks like "I changed the photo but it reset back to default after I left the screen."
 * Keeping every stored image small avoids that failure mode entirely.
 */
export function resizeImageFile(file: File, maxDim = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('خطا در خواندن فایل تصویر'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('خطا در بارگذاری تصویر'));
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            // Canvas unavailable for some reason — fall back to the original data URL.
            resolve(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
