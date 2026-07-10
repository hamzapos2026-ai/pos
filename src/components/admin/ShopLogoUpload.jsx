import { useRef, useState } from 'react';
import { Upload, Trash2, Image as ImageIcon, Link2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { processShopLogoFile, SHOP_LOGO_SPECS } from '../../utils/shopLogoUtils';
import Input from '../ui/Input';
import Button from '../ui/Button';

const ShopLogoUpload = ({
  value = '',
  onChange,
  isDark,
  t = (k, d) => d,
}) => {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState('upload');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await processShopLogoFile(file);
      onChange(dataUrl);
      toast.success(t('shop.logoUploaded', 'Logo upload ho gaya — Save dabao'));
    } catch (err) {
      toast.error(err?.message || t('shop.logoFail', 'Logo upload fail'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
            mode === 'upload'
              ? 'bg-amber-500 text-black border-amber-500'
              : isDark ? 'border-[#2a1f0d] text-gray-400' : 'border-amber-200 text-gray-600',
          )}
        >
          {t('shop.logoUploadTab', 'Upload file')}
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
            mode === 'url'
              ? 'bg-amber-500 text-black border-amber-500'
              : isDark ? 'border-[#2a1f0d] text-gray-400' : 'border-amber-200 text-gray-600',
          )}
        >
          {t('shop.logoUrlTab', 'Logo URL')}
        </button>
      </div>

      <div className={cn(
        'rounded-2xl border p-4 flex flex-col sm:flex-row gap-4 items-start',
        isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-200',
      )}>
        <div className={cn(
          'w-24 h-24 rounded-2xl border flex items-center justify-center shrink-0 overflow-hidden',
          isDark ? 'bg-black/40 border-[#2a1f0d]' : 'bg-white border-amber-100',
        )}>
          {value ? (
            <img src={value} alt="" className="max-w-full max-h-full object-contain p-2" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <ImageIcon className={cn('w-10 h-10', isDark ? 'text-gray-600' : 'text-gray-300')} />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {mode === 'upload' ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={SHOP_LOGO_SPECS.accept}
                className="hidden"
                onChange={handleFile}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={uploading}
                  leftIcon={uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? t('shop.logoUploading', 'Uploading…') : t('shop.logoChoose', 'Choose logo')}
                </Button>
                {value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 className="w-4 h-4" />}
                    onClick={() => onChange('')}
                  >
                    {t('shop.logoRemove', 'Remove')}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Input
              label={t('shop.logoUrl', 'Logo URL')}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://…"
              leftIcon={<Link2 className="w-4 h-4" />}
            />
          )}

          <ul className={cn('text-[10px] space-y-1 leading-snug', isDark ? 'text-gray-500' : 'text-gray-500')}>
            <li><span className="font-bold text-amber-600/90">Format:</span> {SHOP_LOGO_SPECS.formats.join(', ')}</li>
            <li><span className="font-bold text-amber-600/90">Size:</span> Max {SHOP_LOGO_SPECS.maxFileMb} MB · Recommended {SHOP_LOGO_SPECS.recommendedPx}</li>
            <li><span className="font-bold text-amber-600/90">Display:</span> {SHOP_LOGO_SPECS.headerNote}</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ShopLogoUpload;
