/** Shop logo upload — size / format rules */

export const SHOP_LOGO_SPECS = {
  formats: ['PNG', 'JPG', 'WEBP', 'SVG'],
  accept: 'image/png,image/jpeg,image/webp,image/svg+xml',
  maxFileMb: 2,
  maxBytes: 2 * 1024 * 1024,
  displayHeightPx: 40,
  recommendedPx: '256 × 256 px (square)',
  headerNote: 'Header & receipt par ~40px height — wide logo auto fit',
};

const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File read fail'));
    reader.readAsDataURL(file);
  });

const resizeRaster = (dataUrl, maxDim = 256) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/png', 0.92));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('Image load fail'));
    img.src = dataUrl;
  });

/**
 * Process logo file → data URL for Firestore store.logo
 * @returns {Promise<string>}
 */
export const processShopLogoFile = async (file) => {
  if (!file) throw new Error('No file selected');
  if (file.size > SHOP_LOGO_SPECS.maxBytes) {
    throw new Error(`File zyada bara — max ${SHOP_LOGO_SPECS.maxFileMb} MB`);
  }

  const type = String(file.type || '').toLowerCase();
  const okType = SHOP_LOGO_SPECS.accept.split(',').some((t) => type === t.trim());
  if (!okType) {
    throw new Error('Sirf PNG, JPG, WEBP ya SVG allowed');
  }

  const dataUrl = await readAsDataUrl(file);

  if (type === 'image/svg+xml') {
    if (dataUrl.length > 500_000) throw new Error('SVG zyada bara — chota file use karo');
    return dataUrl;
  }

  if (RASTER_TYPES.has(type)) {
    const resized = await resizeRaster(dataUrl, 256);
    if (resized.length > 450_000) {
      throw new Error('Logo compress ke baad bhi bara — choti image use karo');
    }
    return resized;
  }

  return dataUrl;
};
