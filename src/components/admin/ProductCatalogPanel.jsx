import { useState, useCallback, useRef, useEffect } from 'react';
import { Package, Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { SettingsCard } from './SettingsUi';

/** Normalize a product name for de-dupe / compare. */
const nameKey = (s) => String(s || '').trim().toLowerCase();

const newId = () => `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Super Admin product catalog manager.
 * Products are name-only and shared across all branches (stored as a setting →
 * live-syncs to every biller and works offline via the settings cache).
 * Billers see these as a dropdown on the Product Name field (when it is ON).
 */
export const ProductCatalogCard = ({
  productCatalog = [],
  productNameEnabled = false,
  isDark,
  t,
  updateProductCatalog,
}) => {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const inputRef = useRef(null);

  const list = Array.isArray(productCatalog) ? productCatalog : [];
  const pageSize = 14;
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const pageItems = list.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const startCount = list.length === 0 ? 0 : pageIndex * pageSize + 1;
  const endCount = Math.min(list.length, (pageIndex + 1) * pageSize);

  useEffect(() => {
    if (pageIndex >= pageCount) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  const addProduct = useCallback(async () => {
    const name = draft.trim();
    if (!name) {
      toast.error(t('admin.roleSettings.productNameRequired', 'Pehle product ka naam likhein.'));
      inputRef.current?.focus();
      return;
    }
    const key = nameKey(name);
    if (list.some((p) => nameKey(p?.name) === key)) {
      toast(t('admin.roleSettings.productDuplicate', `"${name}" already list mein hai.`, { name }), { icon: 'ℹ️' });
      setDraft('');
      inputRef.current?.focus();
      return;
    }
    if (typeof updateProductCatalog !== 'function') {
      toast.error(t('admin.roleSettings.productSaveFailed', 'Save failed — dobara try karein.'));
      return;
    }
    setBusy(true);
    try {
      await updateProductCatalog((cur) => {
        const arr = Array.isArray(cur) ? cur : [];
        if (arr.some((p) => nameKey(p?.name) === key)) return arr;
        return [...arr, { id: newId(), name }];
      });
      setDraft('');
      toast.success(t('admin.roleSettings.productAdded', `"${name}" add ho gaya — live sync.`, { name }), { duration: 1600 });
    } catch (e) {
      toast.error(e?.message || t('admin.roleSettings.productSaveFailed', 'Save failed — dobara try karein.'));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [draft, list, updateProductCatalog, t]);

  const saveEdit = useCallback(async (id) => {
    const name = editDraft.trim();
    if (!name) {
      toast.error(t('admin.roleSettings.productNameRequired', 'Pehle product ka naam likhein.'));
      return;
    }
    const key = nameKey(name);
    if (list.some((p) => p.id !== id && nameKey(p?.name) === key)) {
      toast(t('admin.roleSettings.productDuplicate', `"${name}" already list mein hai.`, { name }), { icon: 'ℹ️' });
      return;
    }
    if (typeof updateProductCatalog !== 'function') {
      toast.error(t('admin.roleSettings.productSaveFailed', 'Save failed — dobara try karein.'));
      return;
    }
    setBusy(true);
    try {
      await updateProductCatalog((cur) => {
        const arr = Array.isArray(cur) ? cur : [];
        return arr.map((p) => (p?.id === id ? { ...p, name } : p));
      });
      setEditingId(null);
      setEditDraft('');
      toast.success(t('admin.roleSettings.productUpdated', `"${name}" updated successfully.`, { name }), { duration: 1400 });
    } catch (e) {
      toast.error(e?.message || t('admin.roleSettings.productSaveFailed', 'Save failed — dobara try karein.'));
    } finally {
      setBusy(false);
    }
  }, [editDraft, list, t, updateProductCatalog]);

  const startEdit = useCallback((product) => {
    setEditingId(product.id);
    setEditDraft(product.name || '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft('');
  }, []);

  const removeProduct = useCallback(async (id) => {
    if (typeof updateProductCatalog !== 'function') {
      toast.error(t('admin.roleSettings.productSaveFailed', 'Save failed — dobara try karein.'));
      return;
    }
    setBusy(true);
    try {
      await updateProductCatalog((cur) => {
        const arr = Array.isArray(cur) ? cur : [];
        return arr.filter((p) => p?.id !== id);
      });
      setEditingId(null);
      setEditDraft('');
      toast.success(t('admin.roleSettings.productDeleted', 'Product deleted successfully.'));
    } catch (e) {
      toast.error(e?.message || t('admin.roleSettings.productSaveFailed', 'Save failed — dobara try karein.'));
    } finally {
      setBusy(false);
    }
  }, [updateProductCatalog, t]);

  return (
    <SettingsCard
      title={t('admin.roleSettings.productCatalog', 'Product Catalog')}
      subtitle={t('admin.roleSettings.productCatalogHint', 'Add items — billers pick them from the Product Name dropdown')}
      icon={Package}
      isDark={isDark}
      accent="amber"
    >
      {!productNameEnabled && (
        <div className={cn(
          'mb-3 rounded-lg border px-3 py-2 text-[11px] font-medium',
          isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-700',
        )}>
          {t('admin.roleSettings.productCatalogOffHint', '"Product Name" abhi OFF hai — dropdown biller ko tabhi dikhega jab aap upar Product Name ON karein.')}
        </div>
      )}

      {/* Add row */}
      <div className="grid gap-3 rounded-[28px] border border-white/15 bg-white/10 backdrop-blur-2xl p-4 shadow-inner sm:grid-cols-[1fr_auto]">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); } }}
          placeholder={t('admin.roleSettings.productAddPlaceholder', 'e.g. Gold Ring, Chain, Bangle')}
          className={cn(
            'w-full rounded-3xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold outline-none transition duration-150 shadow-sm',
            'text-white placeholder:text-white/50 focus:border-amber-300 focus:bg-white/10',
          )}
        />
        <button
          type="button"
          onClick={addProduct}
          disabled={busy || !draft.trim()}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-3xl px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] transition duration-150 disabled:opacity-40',
            'bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 text-white shadow-lg shadow-amber-500/20 hover:brightness-110',
          )}
        >
          <Plus size={16} />
          {t('admin.roleSettings.productAdd', 'Add Product')}
        </button>
      </div>

      <div className={cn(
        'mt-4 rounded-[28px] border border-white/15 bg-white/10 backdrop-blur-2xl shadow-[0_12px_34px_rgba(0,0,0,0.08)]',
        isDark ? 'bg-[#090704]' : '',
      )}>
        <div className={cn(
          'grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center rounded-t-[28px] bg-white/10',
        )}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/80">{t('admin.roleSettings.totalProductsHeading', 'Total Products')}</p>
            <p className="mt-2 text-3xl font-black text-white">{list.length.toLocaleString()}</p>
            <p className="mt-1 text-sm text-white/70">{t('admin.roleSettings.productListHint', 'Highlight product names for fast biller selection.')}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-amber-500/10">
            <Package className="h-4 w-4" />
            {t('admin.roleSettings.productCatalogBadge', 'Shared list for biller search')}
          </div>
        </div>

        {pageItems.length === 0 ? (
          <div className={cn(
            'px-5 py-10 text-center text-sm',
            'text-amber-200',
          )}>
            {list.length === 0
              ? t('admin.roleSettings.productEmpty', 'Abhi koi product nahi — upar se add karein.')
              : t('admin.roleSettings.productNoMatch', 'Koi match nahi.')}
          </div>
        ) : (
          <div className="divide-y divide-amber-300/30">
            {pageItems.map((p, index) => {
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex flex-col gap-4 px-5 py-4 transition duration-150 sm:flex-row sm:items-center sm:justify-between',
                    isDark ? 'bg-[#090703] hover:bg-[#130d06]' : 'bg-white hover:bg-amber-50',
                  )}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-500 to-orange-500 text-sm font-bold text-white shadow-sm shadow-amber-500/25">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      {isEditing ? (
                        <input
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className={cn(
                            'w-full rounded-3xl border px-4 py-3 text-sm font-semibold outline-none transition duration-150',
                            isDark ? 'bg-[#120b05] border-[#5b3c18] text-white placeholder:text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900 placeholder:text-amber-500',
                          )}
                        />
                      ) : (
                        <p className={cn('text-sm font-semibold truncate', isDark ? 'text-white' : 'text-amber-900')}>
                          {p.name}
                        </p>
                      )}
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-amber-300">
                        {t('admin.roleSettings.productNameLabel', 'Product Name')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => saveEdit(p.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-3xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition duration-150 disabled:opacity-40 hover:bg-amber-600"
                        >
                          <Check size={14} />
                          {t('admin.roleSettings.save', 'Save')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-2 rounded-3xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition duration-150 hover:bg-amber-100"
                        >
                          <X size={14} />
                          {t('admin.roleSettings.cancel', 'Cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="inline-flex items-center gap-2 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition duration-150 hover:bg-amber-100"
                        >
                          <Edit3 size={14} />
                          {t('admin.roleSettings.edit', 'Edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProduct(p.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-3xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition duration-150 disabled:opacity-40 hover:bg-red-100"
                        >
                          <Trash2 size={14} />
                          {t('admin.roleSettings.delete', 'Delete')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SettingsCard>
  );
};

export default ProductCatalogCard;
