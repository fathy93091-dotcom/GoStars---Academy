import { defaults, defaultImages } from '../content/defaults.js'

// تسميات عربية لأجزاء المفاتيح، ليقرأ المدير «عنوان البطاقة 2» لا «home.features.2.title»
const WORD = {
  site: 'الموقع', name: 'اسم الأكاديمية', tagline: 'الشعار النصي', footer: 'أسفل الصفحة', text: 'النص',
  home: 'الرئيسية', hero: 'الواجهة', badge: 'الشارة', title: 'العنوان', lead: 'الوصف', cta: 'دعوة', cta1: 'زر 1', cta2: 'زر 2',
  button: 'نص الزر', features: 'المميزات', programs: 'البرامج', about: 'من نحن', story: 'قصتنا', vision: 'رؤيتنا', mission: 'رسالتنا',
  values: 'قيمنا', study: 'نظام الدراسة', news: 'الأخبار', date: 'التاريخ (YYYY-MM-DD)', tags: 'الوسوم (مفصولة بفاصلة)',
  contact: 'تواصل معنا', info: 'بيانات', phone: 'الهاتف', email: 'البريد', hours: 'ساعات العمل', label: 'العنوان الجانبي',
}
export const TABS = [
  { id: 'general', label: 'عام', match: k => k.startsWith('site.') || k.startsWith('footer.') },
  { id: 'home', label: 'الرئيسية', match: k => k.startsWith('home.') },
  { id: 'about', label: 'من نحن', match: k => k.startsWith('about.') },
  { id: 'programs', label: 'البرامج', match: k => k.startsWith('programs.') || k.startsWith('study.') },
  { id: 'news', label: 'الأخبار', match: k => k.startsWith('news.') },
  { id: 'contact', label: 'تواصل', match: k => k.startsWith('contact.') },
]
export const PAGES = [
  ['about', 'من نحن'], ['programs', 'البرامج'], ['news', 'الأخبار'], ['contact', 'تواصل معنا'],
]
export const IMAGES = [
  ['site.logo', 'شعار الموقع (يستبدل الشعار الافتراضي في الأعلى)', 'نقترح صورة بخلفية شفافة'],
  ['home.hero.image', 'صورة واجهة الرئيسية', ''],
  ['about.story.image', 'صورة «قصتنا»', ''],
]

export const labelOf = key => key.split('.').map(p => WORD[p] || (/^\d+$/.test(p) ? p : p)).reverse().join(' — ').replace(/ — (\d+)/, ' $1')
// الكتل المرقمة: مفتاح العنوان (.title) هو ما يتحكم بإخفاء الكتلة كلها
export const isBlockTitle = key => /\.\d+\.title$/.test(key)
export const textKeys = Object.keys(defaults)
export const longText = key => /(\.text|\.lead)$/.test(key) || key === 'footer.text'
export { defaults, defaultImages }
