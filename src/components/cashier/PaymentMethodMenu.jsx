import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, Smartphone, CreditCard, Building2, ChevronDown } from 'lucide-react';

const PAY_ICONS = {
  Cash: Banknote,
  EasyPaisa: Smartphone,
  JazzCash: Smartphone,
  'Bank Transfer': Building2,
  Card: CreditCard,
};

const PAY_BTN_CLASS = {
  Cash: { dark: 'bg-emerald-600 border-emerald-500 text-white', light: 'bg-emerald-500 border-emerald-400 text-white' },
  EasyPaisa: { dark: 'bg-green-600 border-green-500 text-white', light: 'bg-green-500 border-green-400 text-white' },
  JazzCash: { dark: 'bg-orange-600 border-orange-500 text-white', light: 'bg-orange-500 border-orange-400 text-white' },
  'Bank Transfer': { dark: 'bg-blue-600 border-blue-500 text-white', light: 'bg-blue-500 border-blue-400 text-white' },
  Card: { dark: 'bg-purple-600 border-purple-500 text-white', light: 'bg-purple-500 border-purple-400 text-white' },
};

const PaymentMethodMenu = ({
  value,
  options = [],
  onChange,
  isDark,
  fontSize = 10,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const PayIcon = PAY_ICONS[value] || Banknote;
  const btnClass = PAY_BTN_CLASS[value] || PAY_BTN_CLASS.Cash;

  const updatePos = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuW = 168;
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 220 && rect.top > spaceBelow;
    setPos({
      left,
      width: menuW,
      top: openUp ? rect.top - 8 : rect.bottom + 6,
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const menu = open && pos && createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
        width: pos.width,
        zIndex: 99999,
      }}
      className={`rounded-xl border shadow-2xl overflow-hidden ${
        isDark ? 'bg-[#1e1830] border-[#3d3555]' : 'bg-white border-gray-200'
      }`}
    >
      {options.map((m) => {
        const Icon = PAY_ICONS[m] || Banknote;
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            onClick={() => { onChange(m); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left font-semibold transition-colors ${
              active
                ? isDark ? 'bg-amber-500/25 text-amber-200' : 'bg-amber-100 text-amber-800'
                : isDark ? 'hover:bg-white/8 text-gray-200' : 'hover:bg-gray-50 text-gray-800'
            }`}
            style={{ fontSize: `${fontSize}px` }}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {m}
          </button>
        );
      })}
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 font-bold shadow-md transition-all active:scale-95 min-w-[5.5rem] ${
          isDark ? btnClass.dark : btnClass.light
        }`}
        style={{ fontSize: `${fontSize}px` }}
      >
        <PayIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[5rem]">{value}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </>
  );
};

export default PaymentMethodMenu;
