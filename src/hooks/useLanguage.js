// src/hooks/useLanguage.js
// ✅ COMPLETE v2 — A One Jewelry POS
// ═══════════════════════════════════════════════════════════════
// Multi-language hook with RTL support
// ═══════════════════════════════════════════════════════════════
// FEATURES:
// ✅ English (en) + Urdu (ur) support
// ✅ RTL auto-detection for Urdu
// ✅ t() function for translations
// ✅ dir attribute for text direction
// ✅ localStorage persistence per user
// ✅ Fallback to English if key not found
// ✅ Nested key support (e.g., "biller.entry")
// ✅ Dynamic language switching
// ✅ Both named + default export
// ✅ Context-based (uses LanguageContext)
// ✅ Standalone mode (works without context)
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// TRANSLATION DATA — English
// ═══════════════════════════════════════════════════════════════
const EN = {
  // ── Common ─────────────────────────────────────────────────
  appName:          "A One Jewelry POS",
  loading:          "Loading...",
  save:             "Save",
  cancel:           "Cancel",
  confirm:          "Confirm",
  close:            "Close",
  back:             "Back",
  next:             "Next",
  submit:           "Submit",
  delete:           "Delete",
  edit:             "Edit",
  search:           "Search",
  clear:            "Clear",
  yes:              "Yes",
  no:               "No",
  ok:               "OK",
  done:             "Done",
  error:            "Error",
  success:          "Success",
  warning:          "Warning",
  info:             "Info",
  noData:           "No data available",
  offline:          "Offline",
  online:           "Online",
  pending:          "Pending",
  approved:         "Approved",
  rejected:         "Rejected",

  // ── Auth ───────────────────────────────────────────────────
  login:            "Login",
  logout:           "Logout",
  email:            "Email",
  password:         "Password",
  forgotPassword:   "Forgot Password?",
  rememberMe:       "Remember Me",
  signIn:           "Sign In",
  signingIn:        "Signing in...",
  noAccount:        "No account with this email",
  wrongPassword:    "Incorrect password",
  accountDisabled:  "Account disabled",
  contactAdmin:     "Contact your administrator",

  // ── Setup ──────────────────────────────────────────────────
  setupTitle:       "Initial Setup",
  personalInfo:     "Personal Info",
  businessInfo:     "Business Info",
  fullName:         "Full Name",
  businessName:     "Business Name",
  storeName:        "Store Name",
  storeLocation:    "Store Location",
  createAccount:    "Create Account",
  creating:         "Creating account...",

  // ── Biller ─────────────────────────────────────────────────
  entry:            "ENTRY",
  billSerial:       "Bill Serial",
  price:            "Price",
  qty:              "Qty",
  quantity:         "Quantity",
  productName:      "Product Name",
  discountPerItem:  "Discount / Item",
  addItem:          "Add Item (Enter)",
  noItems:          "No items",
  billLocked:       "Bill Locked",
  billDiscount:     "Bill Discount",
  customerName:     "Customer Name",
  phone:            "Phone",
  home:             "Home",
  city:             "City",
  market:           "Market",
  total:            "Total",
  subtotal:         "Subtotal",
  grandTotal:       "Grand Total",
  checkout:         "Checkout",
  items:            "Items",
  saved:            "Saved",
  savings:          "Savings",
  duplicate:        "Duplicate",
  newBill:          "New Bill",
  clearBill:        "Clear Bill",
  cancelBill:       "Cancel Bill",
  insertToStart:    "Press INSERT to start",

  // ── Customer ───────────────────────────────────────────────
  customerDetails:  "Customer Details",
  customerInfo:     "Customer Info",
  walkingCustomer:  "Walking Customer",
  recentCustomers:  "Recent Customers",
  saveToDatabase:   "Save to Database",
  savedToDb:        "Saved to Database!",
  customerNotFound: "No customer found",
  phoneInvalid:     "Invalid phone number",
  phoneFound:       "Found — data auto-filled",
  newCustomer:      "New customer — will be saved",
  name:             "Name",

  // ── Payment ────────────────────────────────────────────────
  collectPayment:   "Collect Payment",
  totalDue:         "Total Due",
  paymentMethod:    "Payment Method",
  amountReceived:   "Amount Received",
  change:           "Change",
  confirmSave:      "Confirm & Save",
  processing:       "Processing...",
  cash:             "Cash",
  card:             "Card",
  easypaisa:        "EasyPaisa",
  jazzcash:         "JazzCash",
  bankTransfer:     "Bank Transfer",
  amountLessThan:   "Amount less than total",

  // ── Invoice ────────────────────────────────────────────────
  invoice:          "Invoice",
  printInvoice:     "Print Invoice",
  printAndClose:    "Print & Close",
  thermal:          "Thermal",
  copies:           "Copies",
  showItems:        "Show Items",
  hideItems:        "Hide Items",
  scanToVerify:     "Scan to verify",
  thankYou:         "Thank you for your business!",

  // ── Summary ────────────────────────────────────────────────
  billSummary:      "Bill Summary",
  proceed:          "Proceed",
  itemDiscounts:    "Item Discounts",
  totalSavings:     "Total Savings",

  // ── Dashboard ──────────────────────────────────────────────
  dashboard:        "Dashboard",
  todaySales:       "Today Sales",
  todayBills:       "Today Bills",
  pendingPayments:  "Pending Payments",
  recentOrders:     "Recent Orders",

  // ── Roles ──────────────────────────────────────────────────
  biller:           "Biller",
  cashier:          "Cashier",
  manager:          "Manager",
  admin:            "Admin",
  superAdmin:       "Super Admin",

  // ── Status ─────────────────────────────────────────────────
  active:           "Active",
  inactive:         "Inactive",
  locked:           "Locked",
  unlocked:         "Unlocked",

  // ── Time ───────────────────────────────────────────────────
  started:          "Started",
  ended:            "Ended",
  justNow:          "just now",
  minutesAgo:       "minutes ago",
  hoursAgo:         "hours ago",

  // ── Keyboard ───────────────────────────────────────────────
  keyboardShortcuts: "Keyboard Shortcuts",
  pressInsert:      "Press INSERT to start",
  pressF8:          "Press F8 to checkout",
  pressEsc:         "Press ESC to go back",

  // ── Errors ─────────────────────────────────────────────────
  offlineBillSaved: "No internet — bill saved offline",
  permissionDenied: "Permission denied",
  duplicateEntry:   "Duplicate entry",
  saveFailed:       "Save failed. Try again.",
  networkError:     "Network error",
  validPriceReq:    "Valid price required",
  enterPriceFirst:  "Enter a price first",
  enterQtyFirst:    "Enter quantity first",
  productNameReq:   "Product name required",
  addItemsFirst:    "Add items first",
  billEmpty:        "Bill is already empty",
  billSaving:       "Bill is saving...",
  billCleared:      "Bill cleared",
  billCancelled:    "Bill cancelled",
  maxBills:         "Maximum bills reached",
  cannotCloseLast:  "Cannot close last bill",
};

// ═══════════════════════════════════════════════════════════════
// TRANSLATION DATA — Urdu
// ═══════════════════════════════════════════════════════════════
const UR = {
  // ── Common ─────────────────────────────────────────────────
  appName:          "اے ون جیولری پی او ایس",
  loading:          "لوڈ ہو رہا ہے...",
  save:             "محفوظ کریں",
  cancel:           "منسوخ",
  confirm:          "تصدیق",
  close:            "بند کریں",
  back:             "واپس",
  next:             "اگلا",
  submit:           "جمع کرائیں",
  delete:           "حذف",
  edit:             "ترمیم",
  search:           "تلاش",
  clear:            "صاف",
  yes:              "ہاں",
  no:               "نہیں",
  ok:               "ٹھیک ہے",
  done:             "ہو گیا",
  error:            "خرابی",
  success:          "کامیاب",
  warning:          "انتباہ",
  info:             "معلومات",
  noData:           "کوئی ڈیٹا نہیں",
  offline:          "آف لائن",
  online:           "آن لائن",
  pending:          "زیر التوا",
  approved:         "منظور شدہ",
  rejected:         "مسترد",

  // ── Auth ───────────────────────────────────────────────────
  login:            "لاگ ان",
  logout:           "لاگ آؤٹ",
  email:            "ای میل",
  password:         "پاس ورڈ",
  forgotPassword:   "پاس ورڈ بھول گئے؟",
  rememberMe:       "مجھے یاد رکھیں",
  signIn:           "سائن ان",
  signingIn:        "سائن ان ہو رہا ہے...",
  noAccount:        "اس ای میل سے کوئی اکاؤنٹ نہیں",
  wrongPassword:    "غلط پاس ورڈ",
  accountDisabled:  "اکاؤنٹ غیر فعال",
  contactAdmin:     "اپنے ایڈمن سے رابطہ کریں",

  // ── Setup ──────────────────────────────────────────────────
  setupTitle:       "ابتدائی سیٹ اپ",
  personalInfo:     "ذاتی معلومات",
  businessInfo:     "کاروباری معلومات",
  fullName:         "پورا نام",
  businessName:     "کاروبار کا نام",
  storeName:        "دکان کا نام",
  storeLocation:    "دکان کا پتہ",
  createAccount:    "اکاؤنٹ بنائیں",
  creating:         "اکاؤنٹ بنایا جا رہا ہے...",

  // ── Biller ─────────────────────────────────────────────────
  entry:            "اندراج",
  billSerial:       "بل سیریل",
  price:            "قیمت",
  qty:              "مقدار",
  quantity:         "مقدار",
  productName:      "مصنوع کا نام",
  discountPerItem:  "فی آئٹم رعایت",
  addItem:          "آئٹم شامل کریں (Enter)",
  noItems:          "کوئی آئٹم نہیں",
  billLocked:       "بل مقفل ہے",
  billDiscount:     "بل رعایت",
  customerName:     "گاہک کا نام",
  phone:            "فون",
  home:             "گھر",
  city:             "شہر",
  market:           "مارکیٹ",
  total:            "کل",
  subtotal:         "ذیلی کل",
  grandTotal:       "مجموعی کل",
  checkout:         "چیک آؤٹ",
  items:            "آئٹمز",
  saved:            "محفوظ",
  savings:          "بچت",
  duplicate:        "نقل",
  newBill:          "نیا بل",
  clearBill:        "بل صاف کریں",
  cancelBill:       "بل منسوخ",
  insertToStart:    "شروع کرنے کے لیے INSERT دبائیں",

  // ── Customer ───────────────────────────────────────────────
  customerDetails:  "گاہک کی تفصیلات",
  customerInfo:     "گاہک کی معلومات",
  walkingCustomer:  "واکنگ کسٹمر",
  recentCustomers:  "حالیہ گاہک",
  saveToDatabase:   "ڈیٹا بیس میں محفوظ کریں",
  savedToDb:        "ڈیٹا بیس میں محفوظ ہو گیا!",
  customerNotFound: "کوئی گاہک نہیں ملا",
  phoneInvalid:     "غلط فون نمبر",
  phoneFound:       "مل گیا — ڈیٹا خود بھر گیا",
  newCustomer:      "نیا گاہک — محفوظ ہو جائے گا",
  name:             "نام",

  // ── Payment ────────────────────────────────────────────────
  collectPayment:   "ادائیگی وصول کریں",
  totalDue:         "کل واجب الادا",
  paymentMethod:    "ادائیگی کا طریقہ",
  amountReceived:   "وصول شدہ رقم",
  change:           "واپسی",
  confirmSave:      "تصدیق اور محفوظ",
  processing:       "عمل جاری ہے...",
  cash:             "نقد",
  card:             "کارڈ",
  easypaisa:        "ایزی پیسہ",
  jazzcash:         "جیز کیش",
  bankTransfer:     "بینک ٹرانسفر",
  amountLessThan:   "رقم کل سے کم ہے",

  // ── Invoice ────────────────────────────────────────────────
  invoice:          "رسید",
  printInvoice:     "رسید پرنٹ کریں",
  printAndClose:    "پرنٹ اور بند",
  thermal:          "تھرمل",
  copies:           "کاپیاں",
  showItems:        "آئٹمز دکھائیں",
  hideItems:        "آئٹمز چھپائیں",
  scanToVerify:     "تصدیق کے لیے سکین کریں",
  thankYou:         "آپ کی آمد کا شکریہ!",

  // ── Summary ────────────────────────────────────────────────
  billSummary:      "بل کا خلاصہ",
  proceed:          "آگے بڑھیں",
  itemDiscounts:    "آئٹم رعایت",
  totalSavings:     "کل بچت",

  // ── Dashboard ──────────────────────────────────────────────
  dashboard:        "ڈیش بورڈ",
  todaySales:       "آج کی فروخت",
  todayBills:       "آج کے بل",
  pendingPayments:  "زیر التوا ادائیگیاں",
  recentOrders:     "حالیہ آرڈرز",

  // ── Roles ──────────────────────────────────────────────────
  biller:           "بلر",
  cashier:          "کیشیئر",
  manager:          "مینیجر",
  admin:            "ایڈمن",
  superAdmin:       "سپر ایڈمن",

  // ── Status ─────────────────────────────────────────────────
  active:           "فعال",
  inactive:         "غیر فعال",
  locked:           "مقفل",
  unlocked:         "کھلا",

  // ── Time ───────────────────────────────────────────────────
  started:          "شروع ہوا",
  ended:            "ختم ہوا",
  justNow:          "ابھی",
  minutesAgo:       "منٹ پہلے",
  hoursAgo:         "گھنٹے پہلے",

  // ── Keyboard ───────────────────────────────────────────────
  keyboardShortcuts: "کی بورڈ شارٹ کٹس",
  pressInsert:      "شروع کرنے کے لیے INSERT دبائیں",
  pressF8:          "چیک آؤٹ کے لیے F8 دبائیں",
  pressEsc:         "واپس جانے کے لیے ESC دبائیں",

  // ── Errors ─────────────────────────────────────────────────
  offlineBillSaved: "انٹرنیٹ نہیں — بل مقامی طور پر محفوظ ہو گیا",
  permissionDenied: "اجازت نہیں ہے",
  duplicateEntry:   "ڈپلیکیٹ اندراج",
  saveFailed:       "محفوظ نہیں ہوا۔ دوبارہ کوشش کریں۔",
  networkError:     "نیٹ ورک کی خرابی",
  validPriceReq:    "درست قیمت درکار ہے",
  enterPriceFirst:  "پہلے قیمت درج کریں",
  enterQtyFirst:    "پہلے مقدار درج کریں",
  productNameReq:   "مصنوع کا نام درکار ہے",
  addItemsFirst:    "پہلے آئٹمز شامل کریں",
  billEmpty:        "بل پہلے سے خالی ہے",
  billSaving:       "بل محفوظ ہو رہا ہے...",
  billCleared:      "بل صاف ہو گیا",
  billCancelled:    "بل منسوخ ہو گیا",
  maxBills:         "زیادہ سے زیادہ بل کھلے ہیں",
  cannotCloseLast:  "آخری بل بند نہیں ہو سکتا",
};

// ═══════════════════════════════════════════════════════════════
// LANGUAGE MAP
// ═══════════════════════════════════════════════════════════════
const TRANSLATIONS = {
  en: EN,
  ur: UR,
};

// ── RTL languages ─────────────────────────────────────────────
const RTL_LANGUAGES = new Set(["ur", "ar", "fa", "he"]);

// ── Storage key ───────────────────────────────────────────────
const LANG_STORAGE_KEY = "aone_language";

// ── Get nested key value ──────────────────────────────────────
const getNestedValue = (obj, path) => {
  if (!obj || !path) return undefined;
  // Direct key match first (most common)
  if (obj[path] !== undefined) return obj[path];
  // Nested path: "biller.entry" → obj.biller.entry
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
};

// ═══════════════════════════════════════════════════════════════
// HOOK: useLanguage
// ═══════════════════════════════════════════════════════════════
export function useLanguage() {

  // ── Read initial language from storage ────────────────────
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem(LANG_STORAGE_KEY) || "en";
    } catch {
      return "en";
    }
  });

  // ── Derived values ────────────────────────────────────────
  const isRTL = RTL_LANGUAGES.has(language);
  const dir   = isRTL ? "rtl" : "ltr";

  // ── Current translation map ───────────────────────────────
  const translations = useMemo(
    () => TRANSLATIONS[language] || TRANSLATIONS.en,
    [language],
  );

  // ── t() — translate function ──────────────────────────────
  // Returns translated string or fallback to English or key itself
  const t = useCallback((key, fallback) => {
    if (!key) return fallback || "";

    // Try current language
    const value = getNestedValue(translations, key);
    if (value !== undefined) return value;

    // Fallback to English
    if (language !== "en") {
      const enValue = getNestedValue(TRANSLATIONS.en, key);
      if (enValue !== undefined) return enValue;
    }

    // Fallback to provided fallback or key itself
    return fallback || key;
  }, [translations, language]);

  // ── setLanguage — switch language ─────────────────────────
  const setLanguage = useCallback((lang) => {
    const validLang = TRANSLATIONS[lang] ? lang : "en";
    setLanguageState(validLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, validLang);
    } catch {}

    // Update HTML dir + lang attributes
    try {
      const htmlEl = document.documentElement;
      htmlEl.lang = validLang;
      htmlEl.dir  = RTL_LANGUAGES.has(validLang) ? "rtl" : "ltr";
    } catch {}
  }, []);

  // ── toggleLanguage — quick EN ↔ UR toggle ─────────────────
  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "ur" : "en");
  }, [language, setLanguage]);

  // ── Set HTML attributes on mount + language change ────────
  useEffect(() => {
    try {
      const htmlEl = document.documentElement;
      htmlEl.lang = language;
      htmlEl.dir  = dir;
    } catch {}
  }, [language, dir]);

  // ── Available languages list ──────────────────────────────
  const availableLanguages = useMemo(() => [
    { code: "en", name: "English",  nativeName: "English",  flag: "🇬🇧" },
    { code: "ur", name: "Urdu",     nativeName: "اردو",     flag: "🇵🇰" },
  ], []);

  // ── Return ────────────────────────────────────────────────
  return {
    // Current state
    language,
    isRTL,
    dir,

    // Functions
    t,
    setLanguage,
    toggleLanguage,

    // Data
    availableLanguages,
    translations,
  };
}

// ── Default export ────────────────────────────────────────────
export default useLanguage;