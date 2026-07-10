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

import { useCallback, useMemo } from "react";

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
  fraqLess:         "Fraq less",
  fraqLessTotal:    "Fraq Less Total",
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

    // ── Biller dashboard (runtime i18n) ────────────────────────
    nextBillSerial:   "Next Bill Serial",
    offlineSaveLocal: "Offline — bills save locally",
    offlineBanner:    "Offline — Bills saved locally",
    pendingLabel:     "pending",
    noAgentsWarning:  "Salesperson system is enabled but no active agents are configured. Contact SuperAdmin.",
    flatView:         "Flat View",
    groupBySP:        "Group by SP",
    mergeItems:       "Merge Items",
    mergeOn:          "Merge ON",
    mergeOff:         "Merge OFF",
    mergeOnTip:       "Merge ON — click to disable",
    mergeOffTip:      "Merge OFF — click to enable",
    nextItemsTo:      "Next items →",
    duplicateHint:    "type qty + Enter to duplicate",
    enterNewItem:     "Please enter a new item",
    searching:        "Searching...",
    noRecordFound:    "No record found",
    noName:           "No Name",
    phoneHome:        "(Home)",
    permissionDualMode: "Permission required to toggle Dual Mode",
    countingOn:       "Counting: ON",
    countingOff:      "Counting: OFF",
    enableCounting:   "Enable counting",
    disableCounting:  "Disable counting",
    voiceLanguage:    "Voice Language",
    english:          "English",

    // ── Cashier dashboard ─────────────────────────────────────
    cashierTitle:           "POS Cashier",
    cashierStore:           "Store",
    walkInCustomer:         "Walk-in",
    liveBadge:              "LIVE",
    offlineBadge:           "OFFLINE",
    manualBillBtn:          "MANUAL",
    offlineBillBtn:         "OFFLINE BILL",
    offlinePayBySerial:     "Pay pending bill by serial",
    offlinePayBySerialBtn:  "PAY OFFLINE",
    offlinePayTitle:        "Offline Payment",
    offlinePaySubtitle:     "Pending bills only · ESC to close",
    offlinePayPendingOnly:  "Enter serial of a pending bill. Random bills cannot be saved offline.",
    offlinePayBillFound:    "Pending bill found — amount is fixed from bill.",
    offlinePayNotPending:   "This bill is not pending — cannot pay",
    offlinePaySerialLabel:  "Bill Serial",
    offlinePayMethod:       "Payment Method",
    offlinePaySave:         "Save Offline",
    offlinePaySaving:       "Saving...",
    offlinePayDisabled:     "Offline cashier mode is disabled",
    offlinePaySerialRequired: "Bill serial required",
    offlinePaySaveFailed:   "Save failed",
    offlinePayBillerBill:   "BILLER OFFLINE",
    offlinePayPendingList:  "Pending bills",
    offlinePaySubtitleCrossPc: "Same PC list · Other PC = receipt verify",
    offlineReceiptSection:  "From printed bill (other PC)",
    offlineReceiptAmount:   "Amount (Rs.) from bill",
    offlineReceiptVerifyCode: "Verify code (on bill under QR)",
    offlineReceiptHint:     "Other PC? Enter serial + amount + verify code from printed bill (or scan QR).",
    offlineReceiptVerified: "Receipt verified — ready to save payment.",
    offlineReceiptVerifyRequired: "Enter serial, amount & verify code from printed bill",
    offlineReceiptInvalid:  "Invalid serial or amount",
    offlineReceiptBadQr:    "Invalid QR — cannot verify receipt",
    offlineReceiptSaved:    "Receipt payment saved",
    offlineCorrectAmountOnce: "Wrong amount — enter correct amount once.",
    offlinePayCorrectOnce:  "Wrong serial or amount — open Offline Payment and enter correct details once.",
    offlinePayCorrectOnceBtn: "Correct serial / amount once",
    offlinePayCorrectHint:  "Wrong serial or amount — correct once in Offline Payment.",
    offlinePayCorrectRetry: "Payment cleared — enter correct serial and amount once.",
    offlinePayCorrectFailed: "Could not reset payment — try again.",
    offlineSerialMatched:   "Matched",
    offlineSerialPartialHint: "Type last digits e.g. 000030",
    refreshBtn:             "Refresh",
    statsToggle:            "Stats",
    pendingCount:           "pending",
    totalCount:             "total",
    statTotal:              "Total",
    statPending:            "Pending",
    statPaid:               "Paid",
    statCancelled:          "Cancelled",
    searchBillsPh:          "Search bills, name, phone...",
    scanSerialPh:           "Scan barcode or type serial...",
    cameraScanner:          "Camera Scanner",
    navUpDown:              "↑↓ Navigate",
    enterSelect:            "Enter Select",
    escClose:               "Esc Close",
    reviewPayments:         "payments need review",
    reviewPayment:          "payment needs review",
    clickHere:              "Click here",
    noPendingBills:         "No pending bills",
    tryDifferentSerial:     "Try different serial",
    pressEnterOffline:      "Enter serial of a pending bill",
    billAlreadyPaid:        "Bill already paid",
    billCancelledMsg:       "This bill has been cancelled",
    processingPayment:      "Processing payment...",
    notAuthenticated:       "Not authenticated — please login to perform payments",
    paymentFailed:          "Payment failed. Please try again.",
    permissionDeniedPay:    "Permission denied: please re-login or check Firebase rules",
    invalidQR:              "Invalid QR code format",
    billNotFoundOffline:    "Bill not found in pending list",
    refreshed:              "Refreshed!",
    logoutFailed:           "Logout failed",
    backOnlineSync:         "Back online — Syncing...",
    offlineMode:            "Offline mode",
    viewBill:               "View",
    editBill:               "Edit",
    cancelBill:             "Cancel",
    tabPending:             "Pending",
    tabPaid:                "Paid",
    tabCancelled:           "Cancelled",
    tabAll:                 "All",
    addItem2:               "Add",
    newTab:                 "New Tab",
    deleteLast2:            "Del Last",
    minusOncePerBill:       "− used. Add a new item to use again.",
    navigate:               "Nav",
    switchTab:              "Switch",
    closeBill:              "Close",
    confirmClearBill:       "Clear full bill?",
    clearBillHint:          "{{count}} item(s) will be removed.",
    clearConfirmKb:         "← → move · Enter confirm · Esc back",
    escClose:               "ESC to close",
    confirmCancelBill:      "Cancel this bill?",
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
  fraqLess:         "فرق کم",
  fraqLessTotal:    "فرق کم کل",
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

    // ── Biller dashboard (runtime i18n) ────────────────────────
    nextBillSerial:   "اگلا بل سیریل",
    offlineSaveLocal: "آف لائن — بل مقامی طور پر محفوظ",
    offlineBanner:    "آف لائن — بل مقامی طور پر محفوظ",
    pendingLabel:     "زیر التوا",
    noAgentsWarning:  "سیلز پرسن سسٹم فعال ہے مگر کوئی ایجنٹ نہیں۔ سپر ایڈمن سے رابطہ کریں۔",
    flatView:         "فلیٹ ویو",
    groupBySP:        "سیلز پرسن کے مطابق",
    mergeItems:       "آئٹمز ضم کریں",
    mergeOn:          "ضم: آن",
    mergeOff:         "ضم: آف",
    mergeOnTip:       "ضم آن — بند کرنے کے لیے کلک کریں",
    mergeOffTip:      "ضم آف — چالو کرنے کے لیے کلک کریں",
    nextItemsTo:      "اگلے آئٹمز →",
    duplicateHint:    "مقدار لکھیں + Enter سے نقل",
    enterNewItem:     "نیا آئٹم درج کریں",
    searching:        "تلاش جاری...",
    noRecordFound:    "کوئی ریکارڈ نہیں",
    noName:           "بغیر نام",
    phoneHome:        "(گھر)",
    permissionDualMode: "ڈول موڈ کے لیے اجازت درکار ہے",
    countingOn:       "گنتی: آن",
    countingOff:      "گنتی: آف",
    enableCounting:   "گنتی چالو کریں",
    disableCounting:  "گنتی بند کریں",
    voiceLanguage:    "آواز کی زبان",
    english:          "انگریزی",

    // ── Cashier dashboard ─────────────────────────────────────
    cashierTitle:           "کیشئر پی او ایس",
    cashierStore:           "دکان",
    walkInCustomer:         "واک اِن",
    liveBadge:              "لائیو",
    offlineBadge:           "آف لائن",
    manualBillBtn:          "دستی بل",
    offlineBillBtn:         "آف لائن بل",
    offlinePayBySerial:     "زیر التوا بل سیریل سے ادا کریں",
    offlinePayBySerialBtn:  "آف لائن ادا",
    offlinePayTitle:        "آف لائن ادائیگی",
    offlinePaySubtitle:     "صرف زیر التوا بل · Esc بند",
    offlinePayPendingOnly:  "زیر التوا بل کا سیریل درج کریں۔ بے ترتیب بل محفوظ نہیں ہو سکتے۔",
    offlinePayBillFound:    "زیر التوا بل ملا — رقم بل سے طے ہے۔",
    offlinePayNotPending:   "یہ بل زیر التوا نہیں — ادائیگی نہیں ہو سکتی",
    offlinePaySerialLabel:  "بل سیریل",
    offlinePayMethod:       "ادائیگی کا طریقہ",
    offlinePaySave:         "آف لائن محفوظ",
    offlinePaySaving:       "محفوظ ہو رہا ہے...",
    offlinePayDisabled:     "آف لائن کیشئر موڈ بند ہے",
    offlinePaySerialRequired: "بل سیریل درکار ہے",
    offlinePaySaveFailed:   "محفوظ ناکام",
    offlinePayBillerBill:   "بلر آف لائن",
    offlinePayPendingList:  "زیر التوا بل",
    offlinePaySubtitleCrossPc: "اسی PC فہرست · دوسرا PC = رسید verify",
    offlineReceiptSection:  "پرنٹ شدہ بل سے (دوسرا PC)",
    offlineReceiptAmount:   "رقم (بل سے)",
    offlineReceiptVerifyCode: "Verify کوڈ (QR کے نیچے بل پر)",
    offlineReceiptHint:     "دوسرا PC؟ سیریل + رقم + verify کوڈ درج کریں (یا QR سکین)",
    offlineReceiptVerified: "رسید verify — ادائیگی محفوظ کریں",
    offlineReceiptVerifyRequired: "سیریل، رقم اور verify کوڈ درج کریں",
    offlineReceiptInvalid:  "غلط سیریل یا رقم",
    offlineReceiptBadQr:    "غلط QR — verify نہیں ہو سکا",
    offlineReceiptSaved:    "رسید ادائیگی محفوظ",
    offlineCorrectAmountOnce: "غلط رقم — صحیح رقم ایک بار درج کریں۔",
    offlinePayCorrectOnce:  "غلط سیریل یا رقم — Offline Payment کھول کر صحیح details ایک بار درج کریں۔",
    offlinePayCorrectOnceBtn: "سیریل / رقم ایک بار درست کریں",
    offlinePayCorrectHint:  "غلط سیریل یا رقم — Offline Payment میں ایک بار درست کریں۔",
    offlinePayCorrectRetry: "ادائیگی ختم — صحیح سیریل اور رقم ایک بار درج کریں۔",
    offlinePayCorrectFailed: "ادائیگی reset نہیں ہو سکی — دوبارہ کوشش کریں۔",
    offlineSerialMatched:   "مل گیا",
    offlineSerialPartialHint: "آخری ہندسے لکھیں مثلاً 000030",
    refreshBtn:             "ریفریش",
    statsToggle:            "اعداد و شمار",
    pendingCount:           "زیر التوا",
    totalCount:             "کل",
    statTotal:              "کل",
    statPending:            "زیر التوا",
    statPaid:               "ادا شدہ",
    statCancelled:          "منسوخ",
    searchBillsPh:          "بل، نام، فون تلاش کریں...",
    scanSerialPh:           "بارکوڈ سکین یا سیریل لکھیں...",
    cameraScanner:          "کیمرہ سکینر",
    navUpDown:              "↑↓ نیویگیٹ",
    enterSelect:            "Enter منتخب",
    escClose:               "Esc بند",
    reviewPayments:         "ادائیگیوں کی جانچ درکار",
    reviewPayment:          "ادائیگی کی جانچ درکار",
    clickHere:              "یہاں کلک کریں",
    noPendingBills:         "کوئی زیر التوا بل نہیں",
    tryDifferentSerial:     "دوسرا سیریل آزمائیں",
    pressEnterOffline:      "زیر التوا بل کا سیریل درج کریں",
    billAlreadyPaid:        "بل پہلے ہی ادا ہے",
    billCancelledMsg:       "یہ بل منسوخ ہو چکا ہے",
    processingPayment:      "ادائیگی ہو رہی ہے...",
    notAuthenticated:       "لاگ ان نہیں — ادائیگی کے لیے دوبارہ لاگ ان کریں",
    paymentFailed:          "ادائیگی ناکام۔ دوبارہ کوشش کریں۔",
    permissionDeniedPay:    "اجازت نہیں — دوبارہ لاگ ان یا Firebase rules چیک کریں",
    invalidQR:              "غلط QR کوڈ",
    billNotFoundOffline:    "بل زیر التوا فہرست میں نہیں ملا",
    refreshed:              "ریفریش ہو گیا!",
    logoutFailed:           "لاگ آؤٹ ناکام",
    backOnlineSync:         "آن لائن — سینک ہو رہا ہے...",
    offlineMode:            "آف لائن موڈ",
    viewBill:               "دیکھیں",
    editBill:               "ترمیم",
    cancelBill:             "منسوخ",
    tabPending:             "زیر التوا",
    tabPaid:                "ادا شدہ",
    tabCancelled:           "منسوخ",
    tabAll:                 "سب",
    addItem2:               "شامل",
    newTab:                 "نئی ٹیب",
    deleteLast2:            "آخری حذف",
    minusOncePerBill:       "− استعمال ہو چکی۔ نیا آئٹم شامل کریں۔",
    navigate:               "نیوی",
    switchTab:              "بدلیں",
    closeBill:              "بند",
    confirmClearBill:       "پورا بل صاف کریں؟",
    clearBillHint:          "{{count}} آئٹمز ہٹائیں گے۔",
    clearConfirmKb:         "← → حرکت · Enter تصدیق · Esc واپس",
    escClose:               "بند کرنے کے لیے ESC",
    confirmCancelBill:      "کیا یہ بل منسوخ کریں؟",
};

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
// HOOK: useLanguage — bridges LanguageContext + legacy flat keys
// ═══════════════════════════════════════════════════════════════
import { useLanguage as useContextLanguage, LANGUAGES } from '../context/LanguageContext';

export function useLanguage() {
  const ctx = useContextLanguage();

  const legacyMap = useMemo(
    () => (ctx.language === 'ur' ? UR : EN),
    [ctx.language],
  );

  const t = useCallback((key, fallback = '', vars = null) => {
    if (!key) return fallback || '';

    const ctxVal = ctx.t(key, '', vars);
    if (ctxVal && ctxVal !== key) return ctxVal;

    if (legacyMap[key] !== undefined) {
      let result = legacyMap[key];
      if (vars && typeof vars === 'object') {
        Object.entries(vars).forEach(([k, v]) => {
          result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
        });
      }
      return result;
    }

    const nested = getNestedValue(legacyMap, key);
    if (nested !== undefined) return typeof nested === 'string' ? nested : (fallback || key);

    if (ctx.language !== 'en') {
      if (EN[key] !== undefined) return EN[key];
      const enNested = getNestedValue(EN, key);
      if (enNested !== undefined) return enNested;
    }

    return fallback || key;
  }, [ctx, legacyMap]);

  const availableLanguages = useMemo(() =>
    Object.entries(LANGUAGES).map(([code, cfg]) => ({
      code,
      name: cfg.name,
      nativeName: cfg.nativeName,
      flag: cfg.flag,
    })), []);

  return {
    language: ctx.language,
    isRTL: ctx.isRTL,
    dir: ctx.isRTL ? 'rtl' : 'ltr',
    t,
    setLanguage: ctx.setLanguage,
    toggleLanguage: ctx.toggleLanguage,
    availableLanguages,
    translations: { ...legacyMap, ...ctx.translations },
  };
}

// ── Default export ────────────────────────────────────────────
export default useLanguage;