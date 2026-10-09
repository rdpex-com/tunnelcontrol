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
})();
