(function () {
    const Platform = {
        isPWA: () =>
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone,

        isIOS: () =>
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'iPad' && 'ontouchend' in document),

        isAndroid: () =>
            navigator.userAgent.includes('Android'),

        isDesktop: () =>
            !Platform.isIOS() && !Platform.isAndroid(),

        supportsPush: () =>
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            window.isSecureContext
    };

    window.Platform = Platform;

    const html = document.documentElement;

    if (Platform.isIOS()) {
        html.classList.add(Platform.isPWA() ? 'ios-pwa' : 'ios', 'mobile');
    } else if (Platform.isAndroid()) {
        html.classList.add(Platform.isPWA() ? 'android-pwa' : 'android', 'mobile');
    } else {
        html.classList.add('desktop');
    }

    setTimeout(() => html.classList.add('layout-ready'), 3000);

    document.addEventListener('DOMContentLoaded', () => {
        if (!html.classList.contains('mobile')) return;
        const header = document.getElementById('header-container');
        if (header) {
            header.classList.remove('items-center', 'pb-6');
            header.classList.add('flex-col', 'items-start', 'pb-2');
        }
        document.getElementById('title-wrapper')?.classList.add('mb-4');
        document.getElementById('status-container')?.classList.add('self-end', 'mt-[4px]');
        const tabs = document.getElementById('tabs');
        if (tabs) tabs.style.display = 'none';
        document.getElementById('content-container')?.classList.add('pwa-mode');
        document.getElementById('bottom-nav')?.classList.remove('hidden');
    });
})();
