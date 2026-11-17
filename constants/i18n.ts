export type Lang = 'ar' | 'en';

export const translations = {
  ar: {
    appName: 'enjoy', home: 'الرئيسية', search: 'بحث', browse: 'تصفح', myList: 'قائمتي', profile: 'الإعدادات',
    trendingNow: 'الأكثر مشاهدة', newReleases: 'أضيف حديثاً', seeAll: 'عرض الكل', all: 'الكل', movies: 'أفلام', series: 'مسلسلات',
    allGenres: 'كل الأنواع', noResults: 'لا توجد نتائج', tryDifferent: 'جرب بحثاً أو نوعاً مختلفاً', noTitlesMatch: 'لا توجد عناوين مطابقة',
    yourListEmpty: 'قائمتك فارغة', tapToAdd: 'اضغط على + على أي فيلم أو مسلسل لحفظه هنا', titlesSaved: 'عنوان محفوظ', titlesSavedPlural: 'عنوان محفوظ',
    play: 'تشغيل', details: 'تفاصيل', overview: 'نبذة', rating: 'التقييم', length: 'المدة', year: 'السنة', language: 'اللغة',
    director: 'المخرج', cast: 'البطولة', country: 'البلد', episodes: 'الحلقات', nowPlaying: 'يعرض الآن', titleNotFound: 'العنوان غير موجود',
    goBack: 'رجوع', preferences: 'التفضيلات', account: 'الحساب', pushNotifications: 'الإشعارات', autoplayNext: 'تشغيل التالي تلقائياً',
    hdStreaming: 'جودة عالية', privacySecurity: 'الخصوصية والأمان', helpSupport: 'المساعدة والدعم', appSettings: 'إعدادات التطبيق',
    signOut: 'تسجيل الخروج', languageLabel: 'اللغة', arabic: 'العربية', english: 'English', searchPlaceholder: 'ابحث عن أفلام، مسلسلات...',
    maintenanceTitle: 'تحت الصيانة', updateNow: 'تحديث الآن', updateAvailable: 'تحديث متاح', close: 'إغلاق', quality: 'الجودة', auto: 'تلقائي',
    loading: 'جارٍ التحميل...', loadingConfig: 'جارٍ تحميل المحتوى...', configError: 'تعذر تحميل المحتوى. تحقق من اتصالك بالإنترنت.',
    retry: 'إعادة المحاولة', selectQuality: 'اختر الجودة', foreignMovies: 'أفلام أجنبية', seriesGroup: 'مسلسلات', premiumMember: 'عضو مميز',
    watched: 'تمت مشاهدتها', downloaded: 'تم تنزيلها', plan: 'الباقة', channels: 'القنوات', allChannels: 'كل القنوات', noChannels: 'لا توجد قنوات متاحة',
    channelsLoading: 'جارٍ تحميل القنوات...', rewind10: 'تأخير ١٠ ثواني', forward10: 'تقديم ١٠ ثواني', resume: 'متابعة من',
    restart: 'إعادة من البداية', mute: 'كتم الصوت', unmute: 'تشغيل الصوت', exitPlayer: 'الخروج من المشغل', lockPlayer: 'قفل', unlockPlayer: 'فتح القفل',
  },
  en: {
    appName: 'enjoy', home: 'Home', search: 'Search', browse: 'Browse', myList: 'My List', profile: 'Settings', trendingNow: 'Trending Now',
    newReleases: 'New Releases', seeAll: 'See All', all: 'All', movies: 'Movies', series: 'Series', allGenres: 'All Genres',
    noResults: 'No results found', tryDifferent: 'Try a different search or genre.', noTitlesMatch: 'No titles match these filters.',
    yourListEmpty: 'Your list is empty', tapToAdd: 'Tap the + on any movie or series to save it here.', titlesSaved: 'title saved',
    titlesSavedPlural: 'titles saved', play: 'Play', details: 'Details', overview: 'Overview', rating: 'Rating', length: 'Length', year: 'Year',
    language: 'Language', director: 'Director', cast: 'Cast', country: 'Country', episodes: 'Episodes', nowPlaying: 'Now playing',
    titleNotFound: 'Title not found.', goBack: 'Go Back', preferences: 'Preferences', account: 'Account', pushNotifications: 'Push Notifications',
    autoplayNext: 'Autoplay Next', hdStreaming: 'HD Streaming', privacySecurity: 'Privacy & Security', helpSupport: 'Help & Support', appSettings: 'App Settings',
    signOut: 'Sign Out', languageLabel: 'Language', arabic: 'العربية', english: 'English', searchPlaceholder: 'Search movies, series...',
    maintenanceTitle: 'Under Maintenance', updateNow: 'Update Now', updateAvailable: 'Update Available', close: 'Close', quality: 'Quality', auto: 'Auto',
    loading: 'Loading...', loadingConfig: 'Loading content...', configError: 'Could not load content. Check your internet connection.',
    retry: 'Retry', selectQuality: 'Select Quality', foreignMovies: 'Foreign Movies', seriesGroup: 'Series', premiumMember: 'Premium Member',
    watched: 'Watched', downloaded: 'Downloaded', plan: 'Plan', channels: 'Channels', allChannels: 'All Channels', noChannels: 'No channels available',
    channelsLoading: 'Loading channels...', rewind10: 'Rewind 10s', forward10: 'Forward 10s', resume: 'Resume from',
    restart: 'Restart from beginning', mute: 'Mute', unmute: 'Unmute', exitPlayer: 'Exit player', lockPlayer: 'Lock', unlockPlayer: 'Unlock',
  },
};

export type TranslationKey = keyof typeof translations.en;

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'ar';
  const stored = window.localStorage.getItem('app_lang');
  return stored === 'en' ? 'en' : 'ar';
}

export function setLang(lang: Lang): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('app_lang', lang);
    if (typeof document !== 'undefined') {
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
  }
}

export function applyDir(lang: Lang): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }
}
